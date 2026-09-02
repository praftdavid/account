import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { computeIncomeStatement, statementHtml } from '../lib/statements.js';
import { exportTableToExcel } from '../lib/exportExcel.js';

let asOfDate = todayStr();

export async function renderIncomeStatement(container) {
  let tb;
  let accounts;
  let period;
  let years;
  try {
    [{ rows: tb, accounts, period }, years] = await Promise.all([fetchTrialBalance(asOfDate), fetchFiscalYears()]);
  } catch (err) {
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('plAsOf', asOfDate)}<p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('plAsOf', (d) => { asOfDate = d; renderIncomeStatement(container); });
    return;
  }

  const { rows } = computeIncomeStatement(accounts, tb);
  const note = period ? `${period.period_start} ~ ${asOfDate} 누적 (당기 마감 전) · (단위: 원)` : '기준일이 속한 회계기간이 없습니다.';

  container.innerHTML =
    `<div class="card">${asOfDatePickerHtml('plAsOf', asOfDate, years)}</div>` +
    statementHtml('손익계산서', note, rows, { tableId: 'plTable', exportBtnId: 'plExport' });

  wireAsOfDatePicker('plAsOf', (d) => {
    asOfDate = d;
    renderIncomeStatement(container);
  });

  document.getElementById('plExport').onclick = () => {
    exportTableToExcel(document.getElementById('plTable'), `손익계산서_${asOfDate}.xlsx`);
  };
}
