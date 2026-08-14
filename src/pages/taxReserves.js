import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';
import { buildReserveLedger } from '../lib/taxAdjust.js';

let year = null;

// 유보 관리 (자본금과적립금조정명세서 을) — 조회 전용.
// 유보는 "지금은 세무상 인정 안 되지만 나중에 추인될 차이"라서, 소멸할 때까지 매년 이월된다.
// 이 잔액을 놓치면 세무상 자산가액이 회계장부와 어긋난 채 쌓여 처분 시점에 손익이 크게 틀어진다.
export async function renderTaxReserves(container) {
  const years = await fetchFiscalYears();
  if (!year) year = years[years.length - 1] ?? new Date().getFullYear();

  const { data: all, error } = await supabase.from('tax_adjustments').select('*').lte('fiscal_year', year);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const ledger = buildReserveLedger(all ?? [], year);
  const total = ledger.reduce(
    (acc, r) => ({ opening: acc.opening + r.opening, increase: acc.increase + r.increase, decrease: acc.decrease + r.decrease, closing: acc.closing + r.closing }),
    { opening: 0, increase: 0, decrease: 0, closing: 0 }
  );

  const rows = ledger
    .map(
      (r) => `<tr>
        <td>${esc(r.item_name)}</td>
        <td class="num">${fmt(r.opening)}</td>
        <td class="num">${fmt(r.increase)}</td>
        <td class="num">${fmt(r.decrease)}</td>
        <td class="num"><b>${fmt(r.closing)}</b></td>
        <td class="c">${r.closing < 0 ? '<span class="badge draft">△유보</span>' : r.closing > 0 ? '<span class="badge ok">유보</span>' : '<span class="note">소멸</span>'}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>유보 관리 <span class="note">(자본금과적립금조정명세서 을)</span></h2>
    <div class="toolbar">
      <label>사업연도: </label>
      <select id="resYear">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      ${exportButtonHtml('resExport')}
    </div>
    <p class="note">[소득금액조정합계표]에서 <b>유보/△유보</b>로 처분한 조정이 여기 누적됩니다. 기말 잔액이 0이 되면 그 차이는 소멸한 것입니다.</p>
    <div style="overflow-x:auto"><table id="resTable">
      <tr><th>항목</th><th>기초잔액</th><th>당기 증가</th><th>당기 감소</th><th>기말잔액</th><th>구분</th></tr>
      ${rows || '<tr><td colspan="6" class="note">유보로 처분된 세무조정이 없습니다.</td></tr>'}
      ${ledger.length ? `<tr class="tot"><td>합계</td><td class="num">${fmt(total.opening)}</td><td class="num">${fmt(total.increase)}</td><td class="num">${fmt(total.decrease)}</td><td class="num">${fmt(total.closing)}</td><td></td></tr>` : ''}
    </table></div>
    ${ledger.some((r) => r.closing !== 0)
      ? `<p class="note" style="margin-top:12px">기말 잔액이 남은 항목은 <b>${year + 1}년 신고 시 기초잔액으로 이월</b>됩니다. 관련 자산을 처분하는 해에 반대 방향으로 조정해 추인하세요.</p>`
      : ''}
  </div>`;

  document.getElementById('resYear').addEventListener('change', (ev) => {
    year = Number(ev.target.value);
    renderTaxReserves(container);
  });
  document.getElementById('resExport').onclick = () =>
    exportTableToExcel(document.getElementById('resTable'), `유보관리_${year}.xlsx`);
}
