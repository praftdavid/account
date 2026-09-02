import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { CATEGORY_ORDER, leafAccounts, categoryOptionsHtml, accountOptionsHtml } from '../lib/accountPicker.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';

let selectedCategory = null;
let selectedAccountId = null;
let selectedYear = null;

export async function renderLedger(container) {
  const [accounts, years] = await Promise.all([fetchAccounts({ activeOnly: true }), fetchFiscalYears()]);
  if (!selectedYear) selectedYear = years[years.length - 1] ?? Number(todayStr().slice(0, 4));

  if (!selectedCategory) {
    const cash = accounts.find((a) => a.account_code === '11101');
    selectedCategory = cash?.account_type ?? CATEGORY_ORDER[0];
  }
  let leaves = leafAccounts(accounts, selectedCategory);

  if (!selectedAccountId || !leaves.some((a) => a.account_id === selectedAccountId)) {
    const cash = leaves.find((a) => a.account_code === '11101');
    selectedAccountId = (cash ?? leaves[0])?.account_id ?? null;
  }
  const account = accounts.find((a) => a.account_id === selectedAccountId);

  const catOptions = categoryOptionsHtml(selectedCategory);
  const acctOptions = accountOptionsHtml(accounts, leaves, selectedAccountId);

  const yearOptions = years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}년</option>`).join('');
  const isNominal = account?.account_type === 'revenue' || account?.account_type === 'expense';

  container.innerHTML = `
  <div class="card">
    <div class="toolbar"><h2 style="flex:1">계정별원장</h2>${exportButtonHtml('ledgerExport')}</div>
    <div class="toolbar">
      <label>회계연도: </label>
      <select id="ledgerYear">${yearOptions}</select>
      <label>분류: </label>
      <select id="ledgerCat">${catOptions}</select>
      <label>계정과목: </label>
      <select class="acct" id="ledgerAcct">${acctOptions}</select>
      <span class="note">${account ? `(${account.normal_balance === 'debit' ? '차변' : '대변'} 잔액 기준 · 코드 ${esc(account.account_code)}${isNominal ? ` · ${selectedYear}년 발생액만` : ` · 전기이월 + ${selectedYear}년 발생액`})` : ''}</span>
    </div>
    <div id="ledgerBody"><p class="note">불러오는 중…</p></div>
  </div>`;

  document.getElementById('ledgerExport').onclick = () => {
    const table = document.querySelector('#ledgerBody table');
    if (!table) return;
    exportTableToExcel(table, `계정별원장_${account ? account.account_name : ''}_${selectedYear}.xlsx`);
  };

  document.getElementById('ledgerYear').addEventListener('change', (ev) => {
    selectedYear = Number(ev.target.value);
    renderLedger(container);
  });

  document.getElementById('ledgerCat').addEventListener('change', (ev) => {
    selectedCategory = ev.target.value;
    selectedAccountId = null; // 분류가 바뀌면 그 분류의 첫 계정으로 재선택
    renderLedger(container);
  });

  document.getElementById('ledgerAcct').addEventListener('change', (ev) => {
    selectedAccountId = Number(ev.target.value);
    renderLedger(container);
  });

  if (!account) return;

  // 시산표/재무제표와 원장은 목적이 다르다: 시산표는 "잔액 하나"만 필요해 실질계정(자산·부채·자본)을
  // 개시분개 이후 전체 누적으로 계산하지만, 원장은 "그 해의 거래 내역"을 나열하는 화면이라 매년 처음부터
  // 전체 이력을 다시 봐야 하면 못 쓴다. 그래서 실질계정도 선택 연도 이전 누적분은 "전기이월" 한 줄로
  // 합쳐 보여주고, 상세 행은 명목계정과 동일하게 해당 연도 발생분만 나열한다(더존 등 원장 관행과 동일).
  const dir = account.normal_balance === 'debit' ? 1 : -1;
  let openingBalance = 0;
  if (!isNominal) {
    const { data: priorLines, error: priorErr } = await supabase
      .from('journal_lines')
      .select('debit_amount, credit_amount, journal_entries!inner(entry_date, status)')
      .eq('account_id', account.account_id)
      .eq('journal_entries.status', 'posted')
      .lt('journal_entries.entry_date', `${selectedYear}-01-01`);
    if (priorErr) {
      document.getElementById('ledgerBody').innerHTML = `<p class="err">조회 실패: ${esc(priorErr.message)}</p>`;
      return;
    }
    openingBalance = (priorLines ?? []).reduce((s, l) => s + dir * (Number(l.debit_amount) - Number(l.credit_amount)), 0);
  }

  let query = supabase
    .from('journal_lines')
    .select('line_id, debit_amount, credit_amount, journal_entries!inner(entry_date, description, status)')
    .eq('account_id', account.account_id)
    .eq('journal_entries.status', 'posted')
    .gte('journal_entries.entry_date', `${selectedYear}-01-01`)
    .lte('journal_entries.entry_date', `${selectedYear}-12-31`);
  const { data: lines, error } = await query.order('entry_date', { referencedTable: 'journal_entries' });

  const body = document.getElementById('ledgerBody');
  if (error) {
    body.innerHTML = `<p class="err">조회 실패: ${esc(error.message)}</p>`;
    return;
  }

  const sorted = [...(lines ?? [])].sort((a, b) => {
    const d = a.journal_entries.entry_date.localeCompare(b.journal_entries.entry_date);
    return d !== 0 ? d : a.line_id - b.line_id;
  });

  let balance = openingBalance;
  const openingRow = !isNominal
    ? `<tr><td class="c">${selectedYear}-01-01</td><td>전기이월</td><td class="num"></td><td class="num"></td><td class="num">${fmt(openingBalance)}</td></tr>`
    : '';
  const rows = sorted
    .map((l) => {
      const d = Number(l.debit_amount);
      const c = Number(l.credit_amount);
      balance += dir * (d - c);
      return `<tr>
        <td class="c">${esc(l.journal_entries.entry_date)}</td>
        <td>${esc(l.journal_entries.description ?? '')}</td>
        <td class="num">${d ? d.toLocaleString() : ''}</td>
        <td class="num">${c ? c.toLocaleString() : ''}</td>
        <td class="num">${fmt(balance)}</td>
      </tr>`;
    })
    .join('');

  body.innerHTML = `<div style="overflow-x:auto"><table>
    <tr><th>일자</th><th>적요</th><th>차변</th><th>대변</th><th>잔액</th></tr>
    ${openingRow}
    ${rows || (isNominal ? '<tr><td colspan="5" class="note">거래 내역이 없습니다.</td></tr>' : '')}
  </table></div>`;
}
