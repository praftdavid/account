import { supabase } from '../lib/supabaseClient.js';
import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { computeIncomeStatement, makeFlowFn, changeInPeriod } from '../lib/statements.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';

// 간접법 현금흐름표. 매도가능증권(11104) 매매는 이 회사 실질(증권투자가 사실상 주업 — 손익계산서에서도
// "금융영업수익/비용"이라는 매출/매출원가 항목으로 잡음)을 반영해 영업활동으로 분류한다(K-GAAP 일반
// 관행은 투자활동 분류 — 이 회사는 의도적으로 다르게 처리한 것을 화면 각주로 남긴다).
//
// 11104의 현금성 순증감은 "[증권매수]/[증권매도]" 같은 적요 태그로 걸러내려 하면 안 된다 — 실제로
// 2026년 상반기 거래 상당수가 자동분개 파이프라인이 완성되기 전 다른 적요 형식(예: "[아이온큐] 5주*...")
// 으로 수기 입력돼 있어 태그 매칭으로는 누락된다(현금흐름표 최초 검증 때 실제로 이 누락 때문에
// 기말현금 검증 등식이 틀어지는 걸 발견했다). 대신 잔액 기반의 항상 성립하는 등식을 쓴다:
// 반기 재평가·매도 시 OCI 추인은 전부 11104↔33001 두 계정을 "같은 금액만큼 같은 방향"으로 움직이는
// 분개뿐이라(다른 어떤 분개도 33001을 안 건드림), 두 계정의 이번 기간 변동액을 빼면 그 비현금분이
// 정확히 상쇄되고 "현금이 오간 순수 매수−매도원가" 성분만 남는다: 현금성 순증감 = Δ11104 − Δ33001.
const OPERATING_WC = [
  { code: '11102', label: '외상매출금', sign: -1 },
  { code: '11103', label: '미수금', sign: -1 },
  { code: '11105', label: '부가세대급금', sign: -1 },
  { code: '11106', label: '선납세금', sign: -1 },
  { code: '11107', label: '선급금', sign: -1 },
  { code: '11108', label: '선급비용', sign: -1 },
  { code: '11201', label: '상품', sign: -1 },
  { code: '21001', label: '미지급금', sign: 1 },
  { code: '21002', label: '부가세예수금', sign: 1 },
  { code: '21004', label: '미지급세금', sign: 1 },
  { code: '21005', label: '예수금', sign: 1 },
  { code: '21006', label: '선수금', sign: 1 },
  { code: '21007', label: '미지급비용', sign: 1 },
];
const INVESTING = [
  { code: '12101', label: '장기금융상품', sign: -1 },
  { code: '12201', label: '비품', sign: -1 },
  { code: '12202', label: '차량운반구', sign: -1 },
  { code: '12301', label: '소프트웨어', sign: -1 },
  { code: '12401', label: '임차보증금', sign: -1 },
];
const FINANCING = [
  { code: '21003', label: '가수금(대표자)', sign: 1 },
  { code: '22001', label: '장기차입금', sign: 1 },
  { code: '31000', label: '자본금', sign: 1 },
];

let asOfDate = todayStr();

function sectionRows(accounts, rawLines, periodStart, dirOf, list) {
  const rows = [];
  let total = 0;
  for (const { code, label, sign } of list) {
    const acc = accounts.find((a) => a.account_code === code);
    if (!acc) continue;
    const change = changeInPeriod(rawLines, periodStart, acc.account_id, dirOf(acc.account_id));
    if (!change) continue;
    const cf = sign * change;
    total += cf;
    rows.push({ label, cf });
  }
  return { rows, total };
}

export async function renderCashFlow(container) {
  let tb, accounts, rawLines, years, period, 누적순이익;
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
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('cfAsOf', asOfDate)}<p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('cfAsOf', (d) => { asOfDate = d; renderCashFlow(container); });
    return;
  }

  const cashAcct = accounts.find((a) => a.account_code === '11101');
  if (!cashAcct) {
    container.innerHTML = `<div class="card"><p class="err">현금 계정(11101)을 찾을 수 없습니다</p></div>`;
    return;
  }

  const { 당기순이익 } = computeIncomeStatement(accounts, tb);
  const accById = new Map(accounts.map((a) => [a.account_id, a]));
  const dirOf = (id) => (accById.get(id)?.normal_balance === 'debit' ? 1 : -1);
  const currentFlow = makeFlowFn(accounts, tb);
  const periodStart = period?.period_start;

  const depAcct = accounts.find((a) => a.account_code === '61019');
  const depreciation = depAcct ? currentFlow(depAcct.account_id) : 0;

  // 현금성 매도가능증권 순증감 = Δ11104 − Δ33001(반기 재평가·매도 시 OCI 추인은 두 계정을 항상 같은
  // 금액·같은 방향으로 움직이므로 차감하면 비현금분이 상쇄됨). 자산이 순증가(+)했으면 그만큼 현금을
  // 썼다는 뜻이라 현금흐름 조정은 부호를 반대로 뒤집는다.
  const secAcct = accounts.find((a) => a.account_code === '11104');
  const ociAcct = accounts.find((a) => a.account_code === '33001');
  const secNetChange = secAcct ? changeInPeriod(rawLines, periodStart, secAcct.account_id, dirOf(secAcct.account_id)) : 0;
  const ociNetChange = ociAcct ? changeInPeriod(rawLines, periodStart, ociAcct.account_id, dirOf(ociAcct.account_id)) : 0;
  const securitiesCf = -(secNetChange - ociNetChange);

  const wc = sectionRows(accounts, rawLines, periodStart, dirOf, OPERATING_WC);
  const investing = sectionRows(accounts, rawLines, periodStart, dirOf, INVESTING);
  const financing = sectionRows(accounts, rawLines, periodStart, dirOf, FINANCING);

  const operatingRows = [
    { label: '당기순이익', cf: 당기순이익, bold: true },
    ...(depreciation ? [{ label: '(+) 감가상각비', cf: depreciation }] : []),
    ...(securitiesCf ? [{ label: securitiesCf < 0 ? '(−) 매도가능증권 순취득(현금기준)' : '(+) 매도가능증권 순처분(현금기준)', cf: securitiesCf }] : []),
    ...wc.rows,
  ];
  const operatingTotal = 당기순이익 + depreciation + securitiesCf + wc.total;

  const netChange = operatingTotal + investing.total + financing.total;

  const priorYearEnd = period ? `${period.fiscal_year - 1}-12-31` : null;
  const priorTb = priorYearEnd ? await fetchTrialBalance(priorYearEnd) : null;
  const openingCash = priorTb ? makeFlowFn(priorTb.accounts, priorTb.rows)(cashAcct.account_id) : 0;
  const endingCash = currentFlow(cashAcct.account_id);
  const checkOk = Math.abs(openingCash + netChange - endingCash) < 1;

  const sectionHtml = (title, section, emptyNote) => `
    <tr class="sec"><td>${title}</td><td class="num"></td></tr>
    ${section.rows.length
      ? section.rows.map((r) => `<tr><td>　${esc(r.label)}</td><td class="num">${fmt(r.cf)}</td></tr>`).join('')
      : `<tr><td class="note">　${emptyNote}</td><td></td></tr>`}
    <tr><td><b>${title} 합계</b></td><td class="num"><b>${fmt(section.total)}</b></td></tr>`;

  const body = `
    <tr class="sec"><td>Ⅰ. 영업활동현금흐름</td><td class="num"></td></tr>
    ${operatingRows.map((r) => `<tr${r.bold ? ' style="font-weight:600"' : ''}><td>　${esc(r.label)}</td><td class="num">${fmt(r.cf)}</td></tr>`).join('')}
    <tr><td><b>영업활동현금흐름 합계</b></td><td class="num"><b>${fmt(operatingTotal)}</b></td></tr>
    ${sectionHtml('Ⅱ. 투자활동현금흐름', investing, '해당 기간 중 투자활동 거래가 없습니다.')}
    ${sectionHtml('Ⅲ. 재무활동현금흐름', financing, '해당 기간 중 재무활동 거래가 없습니다.')}
    <tr class="sec"><td><b>Ⅳ. 현금의 증가(감소) (Ⅰ+Ⅱ+Ⅲ)</b></td><td class="num"><b>${fmt(netChange)}</b></td></tr>
    <tr><td>Ⅴ. 기초의 현금</td><td class="num">${fmt(openingCash)}</td></tr>
    <tr><td><b>Ⅵ. 기말의 현금 (Ⅳ+Ⅴ)</b></td><td class="num"><b>${fmt(openingCash + netChange)}</b></td></tr>
  `;

  container.innerHTML = `<div class="card">${asOfDatePickerHtml('cfAsOf', asOfDate, years)}</div>
  <div class="card statement">
    <div class="toolbar"><h2 style="flex:1">현금흐름표</h2>${exportButtonHtml('cfExport')}</div>
    <p class="note" style="margin:-6px 0 4px">기준일: ${asOfDate} · 회계연도 시작일부터 기준일까지 (간접법) · (단위: 원)</p>
    <p class="note" style="margin:0 0 12px">
      매도가능증권 매매 현금흐름은 이 회사 실질(증권투자가 사실상 주업)에 맞춰 <b>영업활동</b>으로 분류합니다
      (K-GAAP 일반 관행은 투자활동 분류).
      ${checkOk ? '<span class="badge ok" style="margin-left:6px">검증 ✓ 기말현금 = 실제 11101 잔액</span>' : `<span class="badge bad" style="margin-left:6px">검증 실패 — 계산된 기말현금(${fmt(openingCash + netChange)})과 실제 잔액(${fmt(endingCash)})이 다릅니다. 분류 누락 가능성.</span>`}
    </p>
    <div style="overflow-x:auto"><table id="cfTable">
      <tr><th style="text-align:left">구분</th><th>금액(원)</th></tr>
      ${body}
    </table></div>
  </div>`;

  wireAsOfDatePicker('cfAsOf', (d) => {
    asOfDate = d;
    renderCashFlow(container);
  });

  document.getElementById('cfExport').onclick = () => {
    exportTableToExcel(document.getElementById('cfTable'), `현금흐름표_${asOfDate}.xlsx`);
  };
}
