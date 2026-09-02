import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { makeFlowFn, renderSubtree, subtreeTotal } from '../lib/statements.js';
import { exportTablesToExcel, exportButtonHtml } from '../lib/exportExcel.js';

function sideTableHtml(id, rows) {
  const body = rows
    .map(([label, amt, bold]) => `<tr class="${bold ? 'sec' : ''}"><td>${label}</td><td class="num">${amt === null ? '' : fmt(amt)}</td></tr>`)
    .join('');
  return `<table id="${id}"><tr><th style="text-align:left">과목</th><th>금액</th></tr>${body}</table>`;
}

let asOfDate = todayStr();

export async function renderBalanceSheet(container) {
  let tb;
  let accounts;
  let years;
  let 누적순이익;
  try {
    [{ rows: tb, accounts, 누적순이익 }, years] = await Promise.all([fetchTrialBalance(asOfDate), fetchFiscalYears()]);
  } catch (err) {
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('bsAsOf', asOfDate)}<p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('bsAsOf', (d) => { asOfDate = d; renderBalanceSheet(container); });
    return;
  }

  // 미처분이익잉여금 = 실질계정 자체 잔액(보통 0, 마감분개 없음) + 회계연도 경계 없이
  // asOfDate까지 누적된 순이익(전기 이전 연도분 포함). 당기순이익만 더하면 연도가
  // 넘어갈 때 전기 이전 순이익이 누락되어 대차가 안 맞으므로 반드시 누적순이익을 써야 한다.
  const baseFlow = makeFlowFn(accounts, tb);
  const retained = accounts.find((a) => a.account_code === '35001');
  const overrides = retained ? { [retained.account_id]: baseFlow(retained.account_id) + 누적순이익 } : {};
  const flow = makeFlowFn(accounts, tb, overrides);

  const assetRoot = accounts.find((a) => a.account_code === '10000');
  const liabRoot = accounts.find((a) => a.account_code === '20000');
  const equityRoot = accounts.find((a) => a.account_code === '30000');

  const assetRows = assetRoot ? renderSubtree(accounts, flow, assetRoot.account_id) : [];
  const liabRows = liabRoot ? renderSubtree(accounts, flow, liabRoot.account_id) : [];
  const equityRows = equityRoot ? renderSubtree(accounts, flow, equityRoot.account_id) : [];

  const 자산총계 = assetRoot ? subtreeTotal(accounts, flow, assetRoot.account_id) : 0;
  const 부채총계 = liabRoot ? subtreeTotal(accounts, flow, liabRoot.account_id) : 0;
  const 자본총계 = equityRoot ? subtreeTotal(accounts, flow, equityRoot.account_id) : 0;
  const balanced = 자산총계 === 부채총계 + 자본총계;

  const leftRows = [...assetRows, ['자산총계', 자산총계, true]];
  const rightRows = [
    ...liabRows,
    ['부채총계', 부채총계, true],
    ...equityRows,
    ['자본총계', 자본총계, true],
    ['부채 및 자본 총계', 부채총계 + 자본총계, true],
  ];

  container.innerHTML =
    `<div class="card">${asOfDatePickerHtml('bsAsOf', asOfDate, years)}</div>` +
    `<div class="card statement">
      <div class="toolbar"><h2 style="flex:1">재무상태표</h2>${exportButtonHtml('bsExport')}</div>
      <p class="note" style="margin:-6px 0 12px">기준일: ${asOfDate} · 미처분이익잉여금에 누적순이익(전기 이전분 포함) 반영 · (단위: 원)</p>
      <div class="bs-grid">
        <div class="bs-col">${sideTableHtml('bsAssetTable', leftRows)}</div>
        <div class="bs-col">${sideTableHtml('bsLiabEquityTable', rightRows)}</div>
      </div>
    </div>` +
    `<div class="card"><span class="badge ${balanced ? 'ok' : 'bad'}">${balanced ? '대차평형 일치 ✓' : '대차평형 불일치 ✗'}</span></div>`;

  wireAsOfDatePicker('bsAsOf', (d) => {
    asOfDate = d;
    renderBalanceSheet(container);
  });

  document.getElementById('bsExport').onclick = () => {
    exportTablesToExcel(
      [document.getElementById('bsAssetTable'), document.getElementById('bsLiabEquityTable')],
      ['자산', '부채와자본'],
      `재무상태표_${asOfDate}.xlsx`
    );
  };
}
