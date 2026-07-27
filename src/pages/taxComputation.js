import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchFiscalYears, fetchTrialBalance } from '../lib/data.js';
import { computeIncomeStatement } from '../lib/statements.js';
import { esc, fmt } from '../lib/util.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';
import { computeTaxableIncome, computeCorporateTax, isAddition, applyCredits } from '../lib/taxAdjust.js';

let year = null;

// 법인세 계산 — 결산서상 당기순이익에서 세무조정을 거쳐 과세표준과 산출세액까지 이어 보여준다.
// 셀프 신고 시 신고서의 흐름(법인세과세표준및세액조정계산서)과 같은 순서로 확인하는 것이 목적이다.
export async function renderTaxComputation(container) {
  const years = await fetchFiscalYears();
  if (!year) year = years[years.length - 1] ?? new Date().getFullYear();

  const [accounts, tbResult, { data: adjustments, error }, { data: credits }] = await Promise.all([
    fetchAccounts({ activeOnly: true }),
    fetchTrialBalance(`${year}-12-31`),
    supabase.from('tax_adjustments').select('*').eq('fiscal_year', year),
    supabase.from('tax_credits').select('*').eq('fiscal_year', year),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  // fetchTrialBalance는 {rows, period, accounts, 누적순이익} 형태로 반환한다.
  const { 당기순이익 } = computeIncomeStatement(accounts, tbResult.rows);
  const adj = adjustments ?? [];
  const { additions, subtractions, taxableIncome } = computeTaxableIncome(당기순이익, adj);
  const tax = computeCorporateTax(taxableIncome);
  const cr = applyCredits(tax.corporateTax, taxableIncome, credits ?? []);

  const detailRows = (list) =>
    list.map((a) => `<tr><td>　${esc(a.item_name)}</td><td class="c note">${esc(a.disposal)}</td><td class="num">${fmt(a.amount)}</td></tr>`).join('');

  const bracketRows = tax.detail
    .map((d) => `<tr><td>　${fmt(d.from)} 초과분 (${(d.rate * 100).toFixed(0)}%)</td><td class="num">${fmt(d.base)}</td><td class="num">${fmt(d.amount)}</td></tr>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>법인세 계산</h2>
    <div class="toolbar">
      <label>사업연도: </label>
      <select id="tcYear">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      ${exportButtonHtml('tcExport')}
    </div>

    <div style="overflow-x:auto"><table id="tcTable">
      <tr><th>구분</th><th>소득처분</th><th>금액(원)</th></tr>
      <tr><td><b>결산서상 당기순이익</b></td><td></td><td class="num"><b>${fmt(당기순이익)}</b></td></tr>

      <tr><td><b>(+) 익금산입 · 손금불산입</b></td><td></td><td class="num"><b>${fmt(additions)}</b></td></tr>
      ${detailRows(adj.filter((a) => isAddition(a.adjust_type))) || '<tr><td colspan="3" class="note">　(없음)</td></tr>'}

      <tr><td><b>(−) 손금산입 · 익금불산입</b></td><td></td><td class="num"><b>${fmt(subtractions)}</b></td></tr>
      ${detailRows(adj.filter((a) => !isAddition(a.adjust_type))) || '<tr><td colspan="3" class="note">　(없음)</td></tr>'}

      <tr><td><b>= 각 사업연도 소득금액 (과세표준)</b></td><td></td><td class="num"><b>${fmt(taxableIncome)}</b></td></tr>
    </table></div>

    <h3 style="margin-top:24px">산출세액</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>구간</th><th>과세표준</th><th>세액(원)</th></tr>
      ${bracketRows || '<tr><td colspan="3" class="note">과세표준이 0 이하입니다.</td></tr>'}
      <tr><td><b>법인세 산출세액</b></td><td></td><td class="num"><b>${fmt(tax.corporateTax)}</b></td></tr>
    </table></div>

    <h3 style="margin-top:24px">세액공제 · 기납부세액 차감</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>구분</th><th>내역</th><th>금액(원)</th></tr>
      <tr><td>법인세 산출세액</td><td></td><td class="num">${fmt(tax.corporateTax)}</td></tr>
      <tr><td>(−) 외국납부세액공제</td>
        <td class="note">${cr.foreignPaid ? `납부 ${fmt(cr.foreignPaid)} · 한도 ${fmt(cr.foreignLimit)}${cr.foreignCarryover ? ` · 이월 ${fmt(cr.foreignCarryover)}` : ''}` : '해당 없음'}</td>
        <td class="num">${fmt(cr.foreignCredit)}</td></tr>
      ${cr.otherCredit ? `<tr><td>(−) 기타 세액공제</td><td></td><td class="num">${fmt(cr.otherCredit)}</td></tr>` : ''}
      <tr><td><b>= 총부담세액</b></td><td></td><td class="num"><b>${fmt(cr.totalBurden)}</b></td></tr>
      <tr><td>(−) 기납부세액</td><td class="note">중간예납 · 원천납부</td><td class="num">${fmt(cr.prepaid)}</td></tr>
      <tr><td><b>= 차감납부할세액 (법인세)</b></td><td></td><td class="num"><b>${fmt(cr.payable)}</b></td></tr>
      <tr><td>지방소득세 (법인세의 10%)</td><td class="note">총부담세액 기준</td><td class="num">${fmt(Math.floor(cr.totalBurden * 0.1))}</td></tr>
    </table></div>
    ${cr.payable < 0 ? `<p class="note">차감납부할세액이 음수이면 <b>환급세액 ${fmt(-cr.payable)}원</b>입니다.</p>` : ''}
    ${cr.foreignCarryover ? `<p class="note">외국납부세액 중 <b>${fmt(cr.foreignCarryover)}원</b>은 공제한도를 초과해 당기 공제되지 않으며, 향후 10년간 이월공제 대상입니다.</p>` : ''}

    <p class="note" style="margin-top:12px">
      기납부세액·세액공제는 [기납부세액 · 세액공제] 화면에서 등록한 내역을 반영합니다.
      <b>이월결손금 공제와 각종 감면세액은 아직 반영되지 않으니</b> 해당 사항이 있으면 별도로 확인하세요.
    </p>
  </div>`;

  document.getElementById('tcYear').addEventListener('change', (ev) => {
    year = Number(ev.target.value);
    renderTaxComputation(container);
  });
  document.getElementById('tcExport').onclick = () =>
    exportTableToExcel(document.getElementById('tcTable'), `법인세계산_${year}.xlsx`);
}
