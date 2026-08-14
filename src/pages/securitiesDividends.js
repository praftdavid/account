import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';

let selectedYear = null;

// 배당금내역 — 조회 전용(분개생성 없음). securities_transactions(txn_type='dividend') 이력을
// 다른 재무제표 화면과 동일하게 연도 단위로 끊어서 본다(배당은 매년 0부터 새로 집계되는 항목이라
// 재무상태표 계정처럼 누적할 이유가 없다 — 계정별원장 등과 달리 애초에 "전기이월" 개념이 없음).
export async function renderSecuritiesDividends(container) {
  const years = await fetchFiscalYears();
  if (!selectedYear) selectedYear = years[years.length - 1] ?? Number(todayStr().slice(0, 4));

  const [{ data: finAccounts, error: finErr }, { data: txns, error: txnErr }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities').order('fin_account_id'),
    supabase
      .from('securities_transactions')
      .select('*')
      .eq('txn_type', 'dividend')
      .gte('txn_date', `${selectedYear}-01-01`)
      .lte('txn_date', `${selectedYear}-12-31`)
      .order('txn_date', { ascending: false }),
  ]);
  if (finErr || txnErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc((finErr ?? txnErr).message)}</p></div>`;
    return;
  }

  const acctName = (id) => finAccounts.find((x) => x.fin_account_id === id)?.institution_name ?? '-';

  const rows = (txns ?? [])
    .map(
      (t) => `<tr>
        <td class="c">${esc(t.txn_date)}</td>
        <td>${esc(acctName(t.fin_account_id))}</td>
        <td>${esc(t.name || t.ticker || '')}</td>
        <td class="num">${fmt(t.gross_usd)}</td>
        <td class="num">${fmt(t.tax_usd)}</td>
        <td class="num">${fmt(Number(t.gross_usd) - Number(t.tax_usd))}</td>
        <td class="c">${t.currency}</td>
        <td class="c">${t.status === 'journalized' ? '<span class="badge ok">분개완료</span>' : t.status === 'ignored' ? '<span class="badge">과거 이관분</span>' : '<span class="badge draft">미분개</span>'}</td>
      </tr>`
    )
    .join('');

  const totalGross = (txns ?? []).reduce((s, t) => s + Number(t.gross_usd), 0);
  const totalTax = (txns ?? []).reduce((s, t) => s + Number(t.tax_usd), 0);

  container.innerHTML = `
  <div class="card">
    <h2>배당금내역</h2>
    <div class="toolbar">
      <label>연도: </label>
      <select id="divYear">${years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      <span class="note">${selectedYear}년 수령 총배당금 <b>${fmt(totalGross)}</b> · 원천세 ${fmt(totalTax)} · 실수령 <b>${fmt(totalGross - totalTax)}</b></span>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>계좌</th><th>종목</th><th>총배당금</th><th>원천세</th><th>실수령</th><th>통화</th><th>상태</th></tr>
      ${rows || `<tr><td colspan="8" class="note">${selectedYear}년 배당금 내역이 없습니다.</td></tr>`}
      ${txns?.length ? `<tr class="tot"><td colspan="3">합계</td><td class="num">${fmt(totalGross)}</td><td class="num">${fmt(totalTax)}</td><td class="num">${fmt(totalGross - totalTax)}</td><td colspan="2"></td></tr>` : ''}
    </table></div>
  </div>`;

  document.getElementById('divYear').addEventListener('change', (ev) => {
    selectedYear = Number(ev.target.value);
    renderSecuritiesDividends(container);
  });
}
