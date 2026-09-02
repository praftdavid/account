import { fetchTrialBalance, fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { asOfDatePickerHtml, wireAsOfDatePicker } from '../lib/asOfDate.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';
import { computeIncomeStatement } from '../lib/statements.js';

const TYPE_LABEL = { asset: '자산', liability: '부채', equity: '자본', revenue: '수익', expense: '비용' };
const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

let asOfDate = todayStr();

export async function renderTrialBalance(container) {
  let data;
  let period;
  let years;
  let accounts;
  let 누적순이익;
  try {
    [{ rows: data, period, accounts, 누적순이익 }, years] = await Promise.all([fetchTrialBalance(asOfDate), fetchFiscalYears()]);
  } catch (err) {
    container.innerHTML = `<div class="card">${asOfDatePickerHtml('tbAsOf', asOfDate)}<p class="err">시산표 조회 실패: ${esc(err.message)}</p></div>`;
    wireAsOfDatePicker('tbAsOf', (d) => { asOfDate = d; renderTrialBalance(container); });
    return;
  }

  // 마감 분개 없이 수익·비용을 회계연도마다 새로 집계하는 설계라, 전기 이전 연도의
  // 순이익은 실질계정(현금 등)에는 이미 녹아있지만 명목계정 목록에서는 빠진다.
  // 시산표 차대를 맞추려면 그 전기이월분을 미처분이익잉여금(35001) 대변에 합산해줘야 한다.
  const { 당기순이익 } = computeIncomeStatement(accounts, data);
  const 전기이월 = 누적순이익 - 당기순이익;
  if (전기이월) {
    const retained = accounts.find((a) => a.account_code === '35001');
    if (retained) {
      const existing = data.find((r) => r.account_id === retained.account_id);
      if (existing) {
        existing.total_credit = Number(existing.total_credit) + 전기이월;
        existing.balance = Number(existing.total_debit) - existing.total_credit;
      } else {
        data = [
          ...data,
          {
            account_id: retained.account_id,
            account_code: retained.account_code,
            account_name: retained.account_name,
            account_type: retained.account_type,
            total_debit: 0,
            total_credit: 전기이월,
            balance: -전기이월,
          },
        ];
      }
    }
  }

  let sumDr = 0;
  let sumCr = 0;
  const groups = TYPE_ORDER.map((type) => {
    const rows = data.filter((r) => r.account_type === type).sort((a, b) => a.account_code.localeCompare(b.account_code));
    if (!rows.length) return '';
    const rowsHtml = rows
      .map((r) => {
        sumDr += Number(r.total_debit);
        sumCr += Number(r.total_credit);
        return `<tr>
          <td class="c">${esc(r.account_code)}</td>
          <td>${esc(r.account_name)}</td>
          <td class="num">${fmt(r.total_debit)}</td>
          <td class="num">${fmt(r.total_credit)}</td>
          <td class="num">${fmt(r.balance)}</td>
        </tr>`;
      })
      .join('');
    return `<tr class="sec"><td colspan="5">${TYPE_LABEL[type]}</td></tr>${rowsHtml}`;
  }).join('');

  const balanced = sumDr === sumCr;

  container.innerHTML = `<div class="card">
    <div class="toolbar"><h2 style="flex:1">합계잔액시산표 (posted 기준)</h2>${exportButtonHtml('tbExport')}</div>
    ${asOfDatePickerHtml('tbAsOf', asOfDate, years)}
    <p class="note">${period ? `${period.fiscal_year}기 (${period.period_start} ~ 기준일)` : '기준일이 속한 회계기간이 없습니다.'}${전기이월 ? ` · 미처분이익잉여금에 전기이월손익 ${fmt(전기이월)}원 반영` : ''}</p>
    <div style="overflow-x:auto"><table id="tbTable">
      <tr><th>코드</th><th>계정과목</th><th>차변합계</th><th>대변합계</th><th>잔액</th></tr>
      ${groups || '<tr><td colspan="5" class="note">posted 분개가 없습니다.</td></tr>'}
      <tr class="tot"><td colspan="2">합계</td><td class="num">${fmt(sumDr)}</td><td class="num">${fmt(sumCr)}</td><td></td></tr>
    </table></div>
    <p class="note">${balanced ? '<span class="badge ok">차대 일치 ✓</span>' : '<span class="badge bad">불일치 — 확인 필요 ✗</span>'}</p>
  </div>`;

  wireAsOfDatePicker('tbAsOf', (d) => {
    asOfDate = d;
    renderTrialBalance(container);
  });

  document.getElementById('tbExport').onclick = () => {
    exportTableToExcel(document.getElementById('tbTable'), `시산표_${asOfDate}.xlsx`);
  };
}
