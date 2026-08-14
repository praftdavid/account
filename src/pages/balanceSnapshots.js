import { supabase } from '../lib/supabaseClient.js';
import { esc, fmt, todayStr } from '../lib/util.js';

let selectedFinAccountId = null;

export async function renderBalanceSnapshots(container) {
  const { data: finAccounts, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('is_active', true)
    .order('fin_account_id');
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  if (!selectedFinAccountId && finAccounts.length) selectedFinAccountId = finAccounts[0].fin_account_id;
  const account = finAccounts.find((a) => a.fin_account_id === selectedFinAccountId);

  const acctOptions = finAccounts
    .map((a) => `<option value="${a.fin_account_id}" ${a.fin_account_id === selectedFinAccountId ? 'selected' : ''}>${esc(a.institution_name)}${a.account_no_masked ? ` (${esc(a.account_no_masked)})` : ''}</option>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>잔액증명서 대사</h2>
    <div class="toolbar">
      <label>계좌: </label>
      <select id="bsAcct">${acctOptions || '<option>등록된 계좌 없음</option>'}</select>
    </div>
    <form class="toolbar" id="snapForm">
      <div><label class="note">기준일</label><br><input type="date" id="f_date" value="${todayStr()}" required></div>
      <div><label class="note">증명서상 잔액</label><br><input type="number" id="f_balance" required></div>
      <div><label class="note">&nbsp;</label><br><button class="btn" type="submit">등록/갱신</button></div>
      <span class="err" id="snapErr"></span>
    </form>
    <div id="snapBody"><p class="note">불러오는 중…</p></div>
  </div>`;

  document.getElementById('bsAcct').addEventListener('change', (ev) => {
    selectedFinAccountId = Number(ev.target.value);
    renderBalanceSnapshots(container);
  });

  if (!account) return;

  document.getElementById('snapForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('snapErr');
    errEl.textContent = '';
    const { error: upErr } = await supabase.from('balance_snapshots').upsert(
      {
        fin_account_id: account.fin_account_id,
        as_of_date: document.getElementById('f_date').value,
        certified_balance: Number(document.getElementById('f_balance').value) || 0,
      },
      { onConflict: 'fin_account_id,as_of_date' }
    );
    if (upErr) {
      errEl.textContent = '저장 실패: ' + upErr.message;
      return;
    }
    renderBalanceSnapshots(container);
  });

  const body = document.getElementById('snapBody');
  const [{ data: snapshots, error: snapErr }, { data: txns, error: txnErr }] = await Promise.all([
    supabase.from('balance_snapshots').select('*').eq('fin_account_id', account.fin_account_id).order('as_of_date'),
    supabase.from('raw_transactions').select('txn_date, balance_after').eq('fin_account_id', account.fin_account_id).order('txn_date'),
  ]);
  if (snapErr || txnErr) {
    body.innerHTML = `<p class="err">조회 실패: ${esc((snapErr ?? txnErr).message)}</p>`;
    return;
  }

  const rows = (snapshots ?? [])
    .map((s) => {
      // 기준일 이하 마지막 거래의 balance_after를 시스템 누적잔액으로 사용해 비교한다.
      const upTo = (txns ?? []).filter((t) => t.txn_date <= s.as_of_date);
      const systemBalance = upTo.length ? Number(upTo[upTo.length - 1].balance_after) : null;
      const diff = systemBalance === null ? null : systemBalance - Number(s.certified_balance);
      return `<tr>
        <td class="c">${esc(s.as_of_date)}</td>
        <td class="num">${fmt(s.certified_balance)}</td>
        <td class="num">${systemBalance === null ? '(거래 없음)' : fmt(systemBalance)}</td>
        <td class="c">${diff === null ? '' : diff === 0 ? '<span class="badge ok">일치 ✓</span>' : `<span class="badge bad">차이 ${fmt(diff)}</span>`}</td>
      </tr>`;
    })
    .join('');

  body.innerHTML = `<div style="overflow-x:auto"><table>
    <tr><th>기준일</th><th>증명서상 잔액</th><th>시스템 누적잔액</th><th>대사결과</th></tr>
    ${rows || '<tr><td colspan="4" class="note">등록된 잔액증명서가 없습니다.</td></tr>'}
  </table></div>`;
}
