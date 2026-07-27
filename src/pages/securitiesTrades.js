import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';

// 매매내역 — 조회 전용(분개생성 없음). securities_transactions(매수/매도) 전체 이력.
// 매도 건의 실현손익은 분개 생성 시 journal_lines에 이미 기록된 값(금융영업수익/비용 계정)을 그대로 조회해 보여준다
// (securities_lots는 이동평균 한 줄만 계속 갱신하는 구조라 과거 매도 시점의 손익을 lot에서 재계산할 수 없음).
export async function renderSecuritiesTrades(container) {
  const [{ data: finAccounts, error: finErr }, accounts, { data: txns, error: txnErr }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities').order('fin_account_id'),
    fetchAccounts({ activeOnly: true }),
    supabase
      .from('securities_transactions')
      .select('*')
      .in('txn_type', ['buy', 'sell'])
      .order('txn_date', { ascending: false }),
  ]);
  if (finErr || txnErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc((finErr ?? txnErr).message)}</p></div>`;
    return;
  }

  const incomeAccountId = accounts.find((a) => a.account_code === '41002')?.account_id;
  const expenseAccountId = accounts.find((a) => a.account_code === '51002')?.account_id;

  const sellEntryIds = (txns ?? []).filter((t) => t.txn_type === 'sell' && t.generated_entry_id).map((t) => t.generated_entry_id);
  let gainLossByEntry = new Map();
  if (sellEntryIds.length) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('entry_id, account_id, debit_amount, credit_amount')
      .in('entry_id', sellEntryIds)
      .in('account_id', [incomeAccountId, expenseAccountId].filter(Boolean));
    for (const l of lines ?? []) {
      const cur = gainLossByEntry.get(l.entry_id) ?? 0;
      gainLossByEntry.set(l.entry_id, cur + Number(l.credit_amount) - Number(l.debit_amount));
    }
  }

  const acctName = (id) => {
    const a = finAccounts.find((x) => x.fin_account_id === id);
    return a ? a.institution_name : '-';
  };

  const rows = (txns ?? [])
    .map((t) => {
      const gainLoss = t.txn_type === 'sell' && t.generated_entry_id ? gainLossByEntry.get(t.generated_entry_id) : null;
      return `<tr>
        <td class="c">${esc(t.txn_date)}</td>
        <td>${esc(acctName(t.fin_account_id))}</td>
        <td>${t.txn_type === 'buy' ? '매수' : '매도'}</td>
        <td>${esc(t.name || t.ticker || '')}</td>
        <td class="num">${fmt(t.quantity)}</td>
        <td class="num">${fmt(t.unit_price_usd)}</td>
        <td class="num">${fmt(t.fee_usd)}</td>
        <td class="c">${t.currency}</td>
        <td class="num">${gainLoss === null || gainLoss === undefined ? '' : fmt(gainLoss)}</td>
        <td class="c">${t.status === 'journalized' ? '<span class="badge ok">분개완료</span>' : t.status === 'ignored' ? '<span class="badge">과거 이관분</span>' : '<span class="badge draft">미분개</span>'}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>매매내역</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>계좌</th><th>구분</th><th>종목</th><th>수량</th><th>단가</th><th>수수료</th><th>통화</th><th>실현손익(원)</th><th>상태</th></tr>
      ${rows || '<tr><td colspan="10" class="note">매매 내역이 없습니다.</td></tr>'}
    </table></div>
  </div>`;
}
