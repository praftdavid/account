import { supabase } from '../lib/supabaseClient.js';
import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { computeIncomeStatement, makeFlowFn, changeInPeriod } from '../lib/statements.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';

const EQUITY_LEAVES = [
  { code: '31000', label: '자본금' },
  { code: '33001', label: '매도가능증권평가익' },
  { code: '35001', label: '미처분이익잉여금' },
];

let asOfDate = todayStr();

export async function renderEquityChanges(container) {
  let tb;
  let accounts;
  let rawLines;
  let years;
  let period;
  let 누적순이익;
  try {
    let tbResult;
    [tbResult, years] = await Promise.all([fetchTrialBalance(asOfDate), fetchFiscalYears()]);
    ({ rows: tb, accounts, period, 누적순이익 } = tbResult);
    ({ data: rawLines } = await supabase
      .from('journal_lines')
      .select('account_id, debit_amount, credit_amount, journal_entries!inner(status, entry_date)')
      .eq('journal_entries.status', 'posted')
      .lte('journal_entries.entry_date', asOfDate)
      .throwOnError());
  } catch (err) {
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('eqAsOf', asOfDate)}<p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('eqAsOf', (d) => { asOfDate = d; renderEquityChanges(container); });
    return;
  }

  const { 당기순이익 } = computeIncomeStatement(accounts, tb);
  const accById = new Map(accounts.map((a) => [a.account_id, a]));
  const dirOf = (id) => (accById.get(id)?.normal_balance === 'debit' ? 1 : -1);

  // 기초잔액(=이번 회계연도 시작 시점 잔액)은 별도 개시분개 없이 "기말잔액 - 이번 회계연도
  // 중 변동분"으로 역산한다(changeInPeriod, src/lib/statements.js). 실질계정(자본금 등)의
  // 변동분은 이번 회계연도에 posted된 실제 라인 합계, 미처분이익잉여금은 그 실제 라인 합계 +
  // 누적순이익 중 당기순이익 몫이다.
  const periodStart = period?.period_start;
  const changeThisYear = (accountId) => changeInPeriod(rawLines, periodStart, accountId, dirOf(accountId));

  const currentFlow = makeFlowFn(accounts, tb);

  let sumOpen = 0;
  let sumEnd = 0;
  const rows = EQUITY_LEAVES.map(({ code, label }) => {
    const acc = accounts.find((a) => a.account_code === code);
    if (!acc) return null;
    let ending = currentFlow(acc.account_id);
    let change = changeThisYear(acc.account_id);
    if (code === '35001') {
      ending = currentFlow(acc.account_id) + 누적순이익; // 마감 전이므로 누적순이익을 합산해 표시
      change += 당기순이익; // 실제 posted 라인 변동(보통 0) + 이번 회계연도 당기순이익
    }
    const opening = ending - change;
    sumOpen += opening;
    sumEnd += ending;
    return { label, opening, change, ending };
  }).filter(Boolean);

  const totalRow = { label: '자본총계', opening: sumOpen, change: sumEnd - sumOpen, ending: sumEnd };

  const body = [...rows, totalRow]
    .map(
      (r) => `<tr class="${r === totalRow ? 'tot' : ''}">
        <td>${esc(r.label)}</td>
        <td class="num">${fmt(r.opening)}</td>
        <td class="num">${fmt(r.change)}</td>
        <td class="num">${fmt(r.ending)}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `<div class="card">${asOfDatePickerHtml('eqAsOf', asOfDate, years)}</div>
  <div class="card statement">
    <div class="toolbar"><h2 style="flex:1">자본변동표</h2>${exportButtonHtml('eqExport')}</div>
    <p class="note" style="margin:-6px 0 12px">기준일: ${asOfDate} · 기초=이번 회계연도 시작 시점 잔액, 증감=그 이후 변동(당기순이익 포함) · (단위: 원)</p>
    <div style="overflow-x:auto"><table id="eqTable">
      <tr><th style="text-align:left">구분</th><th>기초잔액</th><th>증감</th><th>기말잔액</th></tr>
      ${body}
    </table></div>
  </div>`;

  wireAsOfDatePicker('eqAsOf', (d) => {
    asOfDate = d;
    renderEquityChanges(container);
  });

  document.getElementById('eqExport').onclick = () => {
    exportTableToExcel(document.getElementById('eqTable'), `자본변동표_${asOfDate}.xlsx`);
  };
}
