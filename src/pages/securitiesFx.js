import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';

// 환전내역 — 조회 전용. 별도 테이블 없이 raw_transactions(증권 계좌) 중 환전성 적요만 필터링해서
// 보여주는 파생 뷰(적요에 "환전"/"외화매수"/"외화매도" 포함 — 원화잔고 diff로 잡힌 현금성 이벤트).
const FX_MEMO_RE = /환전|외화매수|외화매도/;

let selectedYear = null;

export async function renderSecuritiesFx(container) {
  const years = await fetchFiscalYears();
  if (!selectedYear) selectedYear = years[years.length - 1] ?? Number(todayStr().slice(0, 4));

  const { data: finAccounts, error: finErr } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('account_kind', 'securities')
    .order('fin_account_id');
  if (finErr) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(finErr.message)}</p></div>`;
    return;
  }

  const finAccountIds = finAccounts.map((a) => a.fin_account_id);
  const { data: txns, error: txnErr } = finAccountIds.length
    ? await supabase
        .from('raw_transactions')
        .select('*')
        .in('fin_account_id', finAccountIds)
        .gte('txn_date', `${selectedYear}-01-01`)
        .lte('txn_date', `${selectedYear}-12-31`)
        .order('txn_date', { ascending: false })
    : { data: [], error: null };
  if (txnErr) {
    container.innerHTML = `<div class="card"><p class="err">거래 조회 실패: ${esc(txnErr.message)}</p></div>`;
    return;
  }

  const fxTxns = (txns ?? []).filter((t) => FX_MEMO_RE.test(t.memo ?? ''));
  const acctName = (id) => finAccounts.find((x) => x.fin_account_id === id)?.institution_name ?? '-';

  const rows = fxTxns
    .map(
      (t) => `<tr>
        <td class="c">${esc(t.txn_date)}</td>
        <td>${esc(acctName(t.fin_account_id))}</td>
        <td>${esc(t.memo ?? '')}</td>
        <td class="num">${Number(t.amount) > 0 ? fmt(t.amount) : ''}</td>
        <td class="num">${Number(t.amount) < 0 ? fmt(-t.amount) : ''}</td>
        <td class="num">${fmt(t.balance_after)}</td>
      </tr>`
    )
    .join('');

  const totalIn = fxTxns.reduce((s, t) => s + (Number(t.amount) > 0 ? Number(t.amount) : 0), 0);
  const totalOut = fxTxns.reduce((s, t) => s + (Number(t.amount) < 0 ? -Number(t.amount) : 0), 0);

  container.innerHTML = `
  <div class="card">
    <h2>환전내역</h2>
    <div class="toolbar">
      <label>연도: </label>
      <select id="fxYear">${years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      <span class="note">${selectedYear}년 환전입금 <b>${fmt(totalIn)}</b> · 환전출금 <b>${fmt(totalOut)}</b></span>
    </div>
    <p class="note">증권 계좌 원화 예수금 거래 중 환전성 적요(환전/외화매수/외화매도)만 표시합니다.</p>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>계좌</th><th>적요</th><th>입금</th><th>출금</th><th>잔액</th></tr>
      ${rows || `<tr><td colspan="6" class="note">${selectedYear}년 환전 내역이 없습니다.</td></tr>`}
    </table></div>
  </div>`;

  document.getElementById('fxYear').addEventListener('change', (ev) => {
    selectedYear = Number(ev.target.value);
    renderSecuritiesFx(container);
  });
}
