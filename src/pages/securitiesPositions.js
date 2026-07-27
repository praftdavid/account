import { supabase } from '../lib/supabaseClient.js';
import { esc, fmt } from '../lib/util.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';

let selectedAcct = 'all';   // 'all' | fin_account_id
let selectedDate = null;    // null=현재 보유(로트) | 'YYYY-MM-DD'=잔고증명서 스냅샷

// 계좌번호(2772-2843-10)에서 식별용 가운데 4자리만 뽑는다 — 실무에서 계좌를 "2843/2845"로 부르기 때문.
function shortAcct(a) {
  const m = String(a?.account_no_masked ?? '').match(/\d{4}-(\d{4})-/);
  return m ? m[1] : (a?.institution_name ?? '-');
}

// 보유종목 현황 — 조회 전용(분개생성 없음).
//
// 평가금액은 시점마다 달라지므로 기준일 없이는 평가이익을 낼 수 없다. 그래서 두 가지 모드로 본다:
//   · 기준일 선택(잔고증명서 발급일) → securities_valuations 스냅샷. 수량·취득원가·평가금액·평가이익 전부 표시.
//   · '현재 보유' → securities_lots. 시가 정보가 없으므로 취득원가까지만 표시(평가이익은 공란).
// 매도가능증권은 공정가치로 계상되므로 평가금액 합계는 재무상태표 잔액과 정확히 일치해야 한다.
export async function renderSecuritiesPositions(container) {
  const [{ data: finAccounts, error: finErr }, { data: valDates }, { data: accounts }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities').order('fin_account_id'),
    supabase.from('securities_valuations').select('as_of_date').order('as_of_date', { ascending: false }),
    supabase.from('accounts').select('account_id, account_code').in('account_code', ['11104', '33001']),
  ]);
  if (finErr) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(finErr.message)}</p></div>`;
    return;
  }

  const dates = [...new Set((valDates ?? []).map((r) => r.as_of_date))];
  if (selectedDate === null && dates.length) selectedDate = dates[0]; // 기본값: 가장 최근 잔고증명서
  const isSnapshot = selectedDate && selectedDate !== 'current';

  const acctById = new Map(finAccounts.map((a) => [a.fin_account_id, a]));
  const idOf = (code) => accounts?.find((a) => a.account_code === code)?.account_id;

  // 표에 쓸 포지션: 스냅샷이면 평가금액까지, 현재 보유면 원가까지.
  let positions = [];
  let loadErr = null;
  if (isSnapshot) {
    const { data, error } = await supabase.from('securities_valuations').select('*').eq('as_of_date', selectedDate);
    loadErr = error;
    positions = (data ?? []).map((r) => ({
      fin_account_id: r.fin_account_id, ticker: r.ticker, name: r.name,
      quantity: Number(r.quantity), cost: Number(r.cost_basis ?? 0), fair: Number(r.fair_value),
    }));
  } else {
    const { data, error } = await supabase.from('securities_lots').select('*').eq('status', 'open');
    loadErr = error;
    positions = (data ?? []).map((r) => ({
      fin_account_id: r.fin_account_id, ticker: r.ticker, name: r.name,
      quantity: Number(r.quantity), cost: Number(r.cost_basis), fair: null,
    }));
  }
  if (loadErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(loadErr.message)}</p></div>`;
    return;
  }

  // 재무상태표 대사용 GL 잔액. 스냅샷 기준일이면 그 시점까지, 현재 보유면 전체 누적.
  const glQuery = (accountId) => {
    let q = supabase.from('journal_lines').select('debit_amount, credit_amount, journal_entries!inner(entry_date, status)').eq('account_id', accountId).eq('journal_entries.status', 'posted');
    if (isSnapshot) q = q.lte('journal_entries.entry_date', selectedDate);
    return q;
  };
  const [{ data: glLines }, { data: ociLines }] = await Promise.all([glQuery(idOf('11104')), glQuery(idOf('33001'))]);
  const glBalance = (glLines ?? []).reduce((s, l) => s + Number(l.debit_amount) - Number(l.credit_amount), 0);
  const ociBalance = (ociLines ?? []).reduce((s, l) => s + Number(l.credit_amount) - Number(l.debit_amount), 0);

  const visible = selectedAcct === 'all' ? positions : positions.filter((p) => p.fin_account_id === Number(selectedAcct));
  // 비중 기준: 평가금액이 있으면 평가금액(실제 자산 구성), 없으면 취득원가.
  const weightOf = (p) => (isSnapshot ? p.fair : p.cost);
  const shownWeight = visible.reduce((s, p) => s + weightOf(p), 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);
  const totalFair = positions.reduce((s, p) => s + (p.fair ?? 0), 0);

  const sorted = [...visible].sort((a, b) => weightOf(b) - weightOf(a));
  const rows = sorted
    .map((p) => {
      const pct = shownWeight > 0 ? (weightOf(p) / shownWeight) * 100 : 0;
      const gain = p.fair === null ? null : p.fair - p.cost;
      const rate = p.cost > 0 && gain !== null ? (gain / p.cost) * 100 : null;
      return `<tr>
        <td class="c">${esc(shortAcct(acctById.get(p.fin_account_id)))}</td>
        <td>${esc(p.name || p.ticker || '')}</td>
        <td class="c">${esc(p.ticker || '')}</td>
        <td class="num">${fmt(p.quantity)}</td>
        <td class="num">${fmt(p.cost)}</td>
        <td class="num">${p.fair === null ? '–' : fmt(p.fair)}</td>
        <td class="num" style="color:${gain === null ? 'inherit' : gain >= 0 ? '#b3261e' : '#1f4fd8'}">${gain === null ? '–' : fmt(gain)}</td>
        <td class="num">${rate === null ? '–' : `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`}</td>
        <td class="num">${pct.toFixed(1)}%</td>
        <td><div style="background:#e8edf5;border-radius:3px;height:10px;min-width:60px"><div style="background:#2b4570;height:10px;border-radius:3px;width:${pct.toFixed(1)}%"></div></div></td>
      </tr>`;
    })
    .join('');

  const shownCost = visible.reduce((s, p) => s + p.cost, 0);
  const shownFair = visible.reduce((s, p) => s + (p.fair ?? 0), 0);
  const shownGain = shownFair - shownCost;

  const dateOptions = dates
    .map((d) => `<option value="${d}" ${d === selectedDate ? 'selected' : ''}>${d}</option>`)
    .concat(`<option value="current" ${selectedDate === 'current' ? 'selected' : ''}>현재 보유</option>`)
    .join('');
  const acctOptions = [`<option value="all" ${selectedAcct === 'all' ? 'selected' : ''}>전체</option>`]
    .concat(finAccounts.map((a) => `<option value="${a.fin_account_id}" ${String(a.fin_account_id) === String(selectedAcct) ? 'selected' : ''}>${esc(shortAcct(a))}</option>`))
    .join('');

  // 대사: 평가금액 합계는 재무상태표 잔액과 정확히 일치해야 하고(공정가치 계상),
  // 취득원가+평가이익(OCI)의 잔여 차이는 취득원가 복원 오차를 뜻한다.
  const fairDiff = totalFair - glBalance;
  const costDiff = totalCost + ociBalance - glBalance;

  container.innerHTML = `
  <div class="card">
    <h2>보유종목 현황</h2>
    <div class="toolbar">
      <label>기준일: </label>
      <select id="posDate">${dateOptions || '<option value="current">현재 보유</option>'}</select>
      <label>계좌: </label>
      <select id="posAcct">${acctOptions}</select>
      ${exportButtonHtml('posExport')}
    </div>
    <p class="note">${isSnapshot
      ? `${selectedDate} 잔고증명서 기준. 평가이익 = 평가금액 − 취득원가(이동평균법).`
      : '현재 보유 로트 기준. 해당 시점 잔고증명서가 없어 평가금액·평가이익은 표시하지 않습니다.'}</p>
    <div style="overflow-x:auto"><table id="posTable">
      <tr><th>계좌</th><th>종목명</th><th>종목코드</th><th>수량</th><th>취득원가(원)</th><th>평가금액(원)</th><th>평가이익(원)</th><th>수익률</th><th>비중</th><th></th></tr>
      ${rows || '<tr><td colspan="10" class="note">해당 기준일에 보유 종목이 없습니다.</td></tr>'}
      ${visible.length ? `<tr>
        <td colspan="4"><b>합계${selectedAcct === 'all' ? '' : ' (선택 계좌)'}</b></td>
        <td class="num"><b>${fmt(shownCost)}</b></td>
        <td class="num"><b>${isSnapshot ? fmt(shownFair) : '–'}</b></td>
        <td class="num"><b>${isSnapshot ? fmt(shownGain) : '–'}</b></td>
        <td class="num"><b>${isSnapshot && shownCost > 0 ? `${shownGain >= 0 ? '+' : ''}${((shownGain / shownCost) * 100).toFixed(1)}%` : '–'}</b></td>
        <td class="num"><b>100.0%</b></td><td></td>
      </tr>` : ''}
    </table></div>

    <h3 style="margin-top:24px">재무상태표 대사${isSnapshot ? ` (${selectedDate} 기준)` : ''}</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>항목</th><th>금액(원)</th><th>비고</th></tr>
      ${isSnapshot ? `
      <tr><td>평가금액 합계</td><td class="num">${fmt(totalFair)}</td><td class="note">잔고증명서 실측(전체 계좌)</td></tr>
      <tr><td>재무상태표 매도가능증권 (11104)</td><td class="num">${fmt(glBalance)}</td><td class="note">공정가치 계상액</td></tr>
      <tr><td><b>차이</b></td><td class="num"><b>${fmt(fairDiff)}</b></td>
        <td>${Math.abs(fairDiff) < 1 ? '<span class="badge ok">일치 ✓</span>' : '<span class="badge bad">불일치</span>'}</td></tr>
      <tr><td colspan="3" style="height:8px"></td></tr>
      <tr><td>취득원가 합계</td><td class="num">${fmt(totalCost)}</td><td class="note">이동평균 재생값</td></tr>
      <tr><td>매도가능증권평가익 (33001)</td><td class="num">${fmt(ociBalance)}</td><td class="note">기타포괄손익누계액</td></tr>
      <tr><td><b>취득원가 + 평가익</b></td><td class="num"><b>${fmt(totalCost + ociBalance)}</b></td><td class="note">위 장부잔액과 같아야 함</td></tr>
      <tr><td><b>차이</b></td><td class="num"><b>${fmt(costDiff)}</b></td>
        <td>${Math.abs(costDiff) < 1 ? '<span class="badge ok">일치 ✓</span>' : `<span class="badge bad">불일치</span> <span class="note">취득원가 복원 오차 ${((Math.abs(costDiff) / (totalCost || 1)) * 100).toFixed(3)}%</span>`}</td></tr>
      ` : `
      <tr><td>취득원가 합계</td><td class="num">${fmt(totalCost)}</td><td class="note">보유 로트 기준(전체 계좌)</td></tr>
      <tr><td>매도가능증권평가익 (33001)</td><td class="num">${fmt(ociBalance)}</td><td class="note">기타포괄손익누계액</td></tr>
      <tr><td><b>취득원가 + 평가익</b></td><td class="num"><b>${fmt(totalCost + ociBalance)}</b></td><td></td></tr>
      <tr><td>재무상태표 매도가능증권 (11104)</td><td class="num">${fmt(glBalance)}</td><td class="note">실제 장부 잔액</td></tr>
      <tr><td><b>차이</b></td><td class="num"><b>${fmt(costDiff)}</b></td>
        <td>${Math.abs(costDiff) < 1 ? '<span class="badge ok">일치 ✓</span>' : `<span class="badge bad">불일치</span> <span class="note">${((Math.abs(costDiff) / (totalCost || 1)) * 100).toFixed(3)}%</span>`}</td></tr>
      `}
    </table></div>
    ${isSnapshot && Math.abs(costDiff) >= 1
      ? '<p class="note">평가금액은 장부와 정확히 일치하므로 자산 계상액 자체는 문제 없습니다. 잔여 차이는 취득원가를 원본 거래로 복원할 때 쓴 환율과 실제 분개 환율의 차이입니다.</p>'
      : ''}
  </div>`;

  document.getElementById('posDate').addEventListener('change', (ev) => {
    selectedDate = ev.target.value;
    renderSecuritiesPositions(container);
  });
  document.getElementById('posAcct').addEventListener('change', (ev) => {
    selectedAcct = ev.target.value;
    renderSecuritiesPositions(container);
  });
  document.getElementById('posExport').onclick = () =>
    exportTableToExcel(document.getElementById('posTable'), `보유종목현황_${isSnapshot ? selectedDate : '현재'}_${selectedAcct === 'all' ? '전체' : shortAcct(acctById.get(Number(selectedAcct)))}.xlsx`);
}
