import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { computeIncomeStatement, makeFlowFn, statementHtml } from '../lib/statements.js';
import { exportTableToExcel } from '../lib/exportExcel.js';

let asOfDate = todayStr();

export async function renderRetainedEarnings(container) {
  let tb;
  let accounts;
  let years;
  let 누적순이익;
  try {
    [{ rows: tb, accounts, 누적순이익 }, years] = await Promise.all([fetchTrialBalance(asOfDate), fetchFiscalYears()]);
  } catch (err) {
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('reAsOf', asOfDate)}<p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('reAsOf', (d) => { asOfDate = d; renderRetainedEarnings(container); });
    return;
  }

  const { 당기순이익 } = computeIncomeStatement(accounts, tb);
  const flow = makeFlowFn(accounts, tb);
  const retained = accounts.find((a) => a.account_code === '35001');
  // 미처분합계(=재무상태표 미처분이익잉여금)는 실질계정 잔액 + 누적순이익(연도 경계 없음).
  // 전기이월은 그 중 "이번 회계연도 당기순이익"을 뺀 나머지 — 전기 이전 누적분이다.
  const 미처분합계 = (retained ? flow(retained.account_id) : 0) + 누적순이익;
  const 전기이월 = 미처분합계 - 당기순이익;
  const 처분액 = 0;
  const 차기이월 = 미처분합계 - 처분액;

  const rows = [
    ['Ⅰ. 미처분이익잉여금', 미처분합계, true],
    ['　1. 전기이월미처분이익잉여금', 전기이월, false],
    ['　2. 당기순이익', 당기순이익, false],
    ['Ⅱ. 이익잉여금처분액', 처분액, true],
    ['Ⅲ. 차기이월미처분이익잉여금', 차기이월, true],
  ];

  container.innerHTML =
    `<div class="card">${asOfDatePickerHtml('reAsOf', asOfDate, years)}</div>` +
    statementHtml('이익잉여금처분계산서', `기준일: ${asOfDate} · 배당·처분 거래가 아직 없어 처분액은 0으로 표시 · (단위: 원)`, rows, {
      tableId: 'reTable',
      exportBtnId: 'reExport',
    });

  wireAsOfDatePicker('reAsOf', (d) => {
    asOfDate = d;
    renderRetainedEarnings(container);
  });

  document.getElementById('reExport').onclick = () => {
    exportTableToExcel(document.getElementById('reTable'), `이익잉여금처분계산서_${asOfDate}.xlsx`);
  };
}
