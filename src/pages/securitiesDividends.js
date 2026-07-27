import { supabase } from '../lib/supabaseClient.js';
import { esc, fmt } from '../lib/util.js';

// 배당금내역 — 조회 전용(분개생성 없음). securities_transactions(txn_type='dividend') 전체 이력.
export async function renderSecuritiesDividends(container) {
  const [{ data: finAccounts, error: finErr }, { data: txns, error: txnErr }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities').order('fin_account_id'),
    supabase.from('securities_transactions').select('*').eq('txn_type', 'dividend').order('txn_date', { ascending: false }),
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
        <td class="c">${t.status === 'journalized' ? '<span class="badge ok">분개완료</span>' : '<span class="badge draft">미분개</span>'}</td>
      </tr>`
    )
    .join('');

  const totalGross = (txns ?? []).reduce((s, t) => s + Number(t.gross_usd), 0);
  const totalTax = (txns ?? []).reduce((s, t) => s + Number(t.tax_usd), 0);

  container.innerHTML = `
  <div class="card">
    <h2>배당금내역</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>계좌</th><th>종목</th><th>총배당금</th><th>원천세</th><th>실수령</th><th>통화</th><th>상태</th></tr>
      ${rows || '<tr><td colspan="8" class="note">배당금 내역이 없습니다.</td></tr>'}
      ${txns?.length ? `<tr><td colspan="3"></td><td class="num"><b>${fmt(totalGross)}</b></td><td class="num"><b>${fmt(totalTax)}</b></td><td class="num"><b>${fmt(totalGross - totalTax)}</b></td><td colspan="2"></td></tr>` : ''}
    </table></div>
  </div>`;
}
