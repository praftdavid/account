import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';
import { ALL_TYPES, DISPOSALS, isAddition, buildReserveLedger } from '../lib/taxAdjust.js';

let year = null;

// 소득금액조정합계표 — 당기 세무조정 내역을 등록·조회한다.
// 회계이익과 세무소득의 차이를 여기서 관리하고, 유보로 처분된 건은 유보관리 화면으로 이월된다.
export async function renderTaxAdjustments(container) {
  const years = await fetchFiscalYears();
  if (!year) year = years[years.length - 1] ?? new Date().getFullYear();

  const [{ data: adjustments, error }, { data: accounts }] = await Promise.all([
    supabase.from('tax_adjustments').select('*').eq('fiscal_year', year).order('adjustment_id'),
    supabase.from('accounts').select('account_id, account_code, account_name').eq('is_active', true).order('account_code'),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const additions = (adjustments ?? []).filter((a) => isAddition(a.adjust_type));
  const subtractions = (adjustments ?? []).filter((a) => !isAddition(a.adjust_type));
  const sum = (arr) => arr.reduce((s, a) => s + Number(a.amount), 0);

  const rowsHtml = (list) =>
    list
      .map(
        (a) => `<tr data-id="${a.adjustment_id}">
        <td>${esc(a.item_name)}</td>
        <td class="c">${esc(a.adjust_type)}</td>
        <td class="num">${fmt(a.amount)}</td>
        <td class="c">${esc(a.disposal)}</td>
        <td>${esc(a.memo ?? '')}</td>
        <td class="c"><button type="button" class="btn ghost sm delBtn">삭제</button></td>
      </tr>`
      )
      .join('');

  container.innerHTML = `
  <div class="card">
    <h2>소득금액조정합계표</h2>
    <div class="toolbar">
      <label>사업연도: </label>
      <select id="taxYear">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      ${exportButtonHtml('taxExport')}
    </div>
    <p class="note">각 세무조정의 소득처분이 <b>유보/△유보</b>면 다음 사업연도로 이월되어 [유보 관리]에 누적됩니다. 사외유출·기타는 이월되지 않습니다.</p>

    <h3>익금산입 · 손금불산입 (가산)</h3>
    <div style="overflow-x:auto"><table id="taxTableAdd">
      <tr><th>항목</th><th>구분</th><th>금액(원)</th><th>소득처분</th><th>비고</th><th></th></tr>
      ${rowsHtml(additions) || '<tr><td colspan="6" class="note">등록된 내역이 없습니다.</td></tr>'}
      ${additions.length ? `<tr class="tot"><td colspan="2">합계</td><td class="num">${fmt(sum(additions))}</td><td colspan="3"></td></tr>` : ''}
    </table></div>

    <h3 style="margin-top:20px">손금산입 · 익금불산입 (차감)</h3>
    <div style="overflow-x:auto"><table id="taxTableSub">
      <tr><th>항목</th><th>구분</th><th>금액(원)</th><th>소득처분</th><th>비고</th><th></th></tr>
      ${rowsHtml(subtractions) || '<tr><td colspan="6" class="note">등록된 내역이 없습니다.</td></tr>'}
      ${subtractions.length ? `<tr class="tot"><td colspan="2">합계</td><td class="num">${fmt(sum(subtractions))}</td><td colspan="3"></td></tr>` : ''}
    </table></div>

    <h3 style="margin-top:24px">세무조정 추가</h3>
    <form class="toolbar" id="taxForm">
      <div><label class="note">항목</label><br><input type="text" id="f_item" placeholder="예: 매도가능증권평가익" required style="min-width:200px"></div>
      <div><label class="note">구분</label><br><select id="f_type">${ALL_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div><label class="note">금액</label><br><input type="number" id="f_amount" required></div>
      <div><label class="note">소득처분</label><br><select id="f_disposal">${DISPOSALS.map((d) => `<option>${d}</option>`).join('')}</select></div>
      <div><label class="note">관련 계정(선택)</label><br><select id="f_account"><option value="">(없음)</option>${(accounts ?? []).map((a) => `<option value="${a.account_id}">${esc(a.account_code)} ${esc(a.account_name)}</option>`).join('')}</select></div>
      <div><label class="note">비고</label><br><input type="text" id="f_memo"></div>
      <div><label class="note">&nbsp;</label><br><button class="btn" type="submit">추가</button></div>
      <span class="err" id="taxErr"></span>
    </form>
    <div id="taxSuggest"></div>
  </div>`;

  document.getElementById('taxYear').addEventListener('change', (ev) => {
    year = Number(ev.target.value);
    renderTaxAdjustments(container);
  });
  document.getElementById('taxExport').onclick = () =>
    exportTableToExcel(document.getElementById('taxTableAdd'), `소득금액조정합계표_${year}.xlsx`);

  document.getElementById('taxForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('taxErr');
    errEl.textContent = '';
    const { error: insErr } = await supabase.from('tax_adjustments').insert({
      fiscal_year: year,
      item_name: document.getElementById('f_item').value.trim(),
      adjust_type: document.getElementById('f_type').value,
      amount: Number(document.getElementById('f_amount').value) || 0,
      disposal: document.getElementById('f_disposal').value,
      account_id: Number(document.getElementById('f_account').value) || null,
      memo: document.getElementById('f_memo').value.trim() || null,
    });
    if (insErr) {
      errEl.textContent = '저장 실패: ' + insErr.message;
      return;
    }
    renderTaxAdjustments(container);
  });

  container.querySelectorAll('.delBtn').forEach((btn) => {
    btn.onclick = async () => {
      const id = Number(btn.closest('tr').dataset.id);
      await supabase.from('tax_adjustments').delete().eq('adjustment_id', id);
      renderTaxAdjustments(container);
    };
  });

  await renderSuggestion(document.getElementById('taxSuggest'), year, adjustments ?? [], container);
}

// 매도가능증권평가익 세무조정은 반드시 두 줄이 짝을 이룬다.
//
// 이 평가익은 손익계산서를 거치지 않고 자본(기타포괄손익)으로 직접 계상되므로 당기순이익에 없다.
// 따라서 "익금불산입"만 걸면 있지도 않은 수익을 빼는 셈이 되어 과세표준이 그만큼 과소계상된다.
// 올바른 처리는 자본 증가분을 익금산입(기타)하고, 동시에 세무상 자산을 취득원가로 되돌리는
// 손금산입(△유보)을 함께 잡는 것이다. 두 줄의 소득 효과는 상계되어 과세표준은 변하지 않고,
// 자산의 세무상 장부가 차이만 △유보로 남아 매도 시점에 추인된다.
//
// 검증 원리: 매도가능증권 관련 유보 잔액은 항상 평가익(OCI) 잔액의 음수와 같아야 한다.
//   유보 기말잔액 = −(33001 기말잔액)
// 이 등식이 깨지면 조정이 누락됐거나 잘못 등록된 것이다. 특히 놓치기 쉬운 게 전기 평가익 환입분
// 추인이다 — 매년 초 전기분을 환입하고 기말에 다시 계상하는 구조라, 환입에 대응하는 유보 추인을
// 빠뜨리면 유보가 해마다 이중으로 누적된다(실제로 2026년에 이 오류가 발생했다).
// 그래서 환입액(차변)과 신규계상액(대변)을 각각 뽑아 신고서 서식대로 총액으로 제안한다.
const AFS_RESERVE_ITEM = '매도가능증권평가익'; // 유보 항목명 — 연도를 넘어 한 줄로 이월되려면 고정해야 한다
const AFS_COUNTER_ITEM = '매도가능증권';

async function renderSuggestion(el, fiscalYear, adjustments, container) {
  const { data: acct } = await supabase.from('accounts').select('account_id').eq('account_code', '33001').maybeSingle();
  if (!acct) return;

  const { data: allLines } = await supabase
    .from('journal_lines')
    .select('debit_amount, credit_amount, journal_entries!inner(entry_date, status)')
    .eq('account_id', acct.account_id)
    .eq('journal_entries.status', 'posted')
    .lte('journal_entries.entry_date', `${fiscalYear}-12-31`);
  const lines = allLines ?? [];
  const ociClosing = lines.reduce((s, l) => s + Number(l.credit_amount) - Number(l.debit_amount), 0);

  const inYear = lines.filter((l) => l.journal_entries.entry_date >= `${fiscalYear}-01-01`);
  const reversed = inYear.reduce((s, l) => s + Number(l.debit_amount), 0);   // 전기분 환입
  const recognized = inYear.reduce((s, l) => s + Number(l.credit_amount), 0); // 당기 신규 계상

  const { data: allAdj } = await supabase.from('tax_adjustments').select('*').lte('fiscal_year', fiscalYear);
  const ledger = buildReserveLedger(allAdj ?? [], fiscalYear);
  const current = ledger.find((r) => r.item_name === AFS_RESERVE_ITEM);
  const closingReserve = current?.closing ?? 0;
  const expected = -ociClosing;
  const ok = Math.abs(closingReserve - expected) < 1;

  if (ok && ociClosing === 0) return;
  if (ok) {
    el.innerHTML = `<div class="card" style="background:#e5f9ee;border-color:#b8e8cc;margin-top:16px">
      <p><b>유보 검증 ✓</b> 매도가능증권평가익 유보 기말잔액 <b>${fmt(closingReserve)}</b> = −(평가익 잔액 ${fmt(ociClosing)}) — 정합합니다.</p>
    </div>`;
    return;
  }

  const pairs = [];
  if (reversed > 0) pairs.push({ label: '전기 평가익 환입분 추인', amount: reversed, kind: 'reverse' });
  if (recognized > 0) pairs.push({ label: '당기 평가익 계상분', amount: recognized, kind: 'recognize' });

  el.innerHTML = `<div class="card" style="background:#fff4e0;border-color:#f5cf8a;margin-top:16px">
    <p><b>확인 필요:</b> 매도가능증권평가익 유보 잔액이 맞지 않습니다.</p>
    <table style="margin:8px 0">
      <tr><th>항목</th><th>금액(원)</th></tr>
      <tr><td>현재 등록된 유보 기말잔액</td><td class="num">${fmt(closingReserve)}</td></tr>
      <tr><td>있어야 할 잔액 <span class="note">= −(평가익 잔액)</span></td><td class="num">${fmt(expected)}</td></tr>
      <tr><td><b>차이</b></td><td class="num"><b>${fmt(closingReserve - expected)}</b></td></tr>
    </table>
    ${pairs.length ? `
    <p class="note">${fiscalYear}년 평가익 계정 움직임에 따라 아래 조정이 필요합니다. 평가익은 손익계산서를 거치지 않고
      자본으로 계상되므로, 각 조정은 소득 효과가 상계되는 두 줄이 짝을 이룹니다(과세표준 불변, 유보만 변동).</p>
    <table style="margin:8px 0">
      <tr><th>구분</th><th>과목</th><th>금액</th><th>소득처분</th></tr>
      ${pairs.map((p) => p.kind === 'reverse'
        ? `<tr><td rowspan="2">${p.label}</td><td>익금산입 ${AFS_RESERVE_ITEM}</td><td class="num">${fmt(p.amount)}</td><td class="c">유보</td></tr>
           <tr><td>손금산입 ${AFS_COUNTER_ITEM}</td><td class="num">${fmt(p.amount)}</td><td class="c">기타</td></tr>`
        : `<tr><td rowspan="2">${p.label}</td><td>익금산입 ${AFS_COUNTER_ITEM}</td><td class="num">${fmt(p.amount)}</td><td class="c">기타</td></tr>
           <tr><td>손금산입 ${AFS_RESERVE_ITEM}</td><td class="num">${fmt(p.amount)}</td><td class="c">△유보</td></tr>`
      ).join('')}
    </table>
    <button class="btn" id="taxAutoAdd">위 조정 자동 등록</button>
    <span class="note">기존 ${fiscalYear}년 매도가능증권 관련 조정은 교체됩니다.</span>
    ` : '<p class="note">해당 연도에 평가익 계정 움직임이 없습니다. 직접 확인이 필요합니다.</p>'}
  </div>`;

  const btn = document.getElementById('taxAutoAdd');
  if (!btn) return;
  btn.onclick = async () => {
    // 중복 등록을 막기 위해 해당 연도의 매도가능증권 관련 조정을 먼저 정리한다.
    await supabase.from('tax_adjustments').delete().eq('fiscal_year', fiscalYear).in('item_name', [AFS_RESERVE_ITEM, AFS_COUNTER_ITEM]);
    const rows = [];
    for (const p of pairs) {
      if (p.kind === 'reverse') {
        rows.push(
          { fiscal_year: fiscalYear, item_name: AFS_RESERVE_ITEM, adjust_type: '익금산입', amount: p.amount, disposal: '유보', account_id: acct.account_id, memo: '전기 평가익 환입에 따른 유보 추인' },
          { fiscal_year: fiscalYear, item_name: AFS_COUNTER_ITEM, adjust_type: '손금산입', amount: p.amount, disposal: '기타', memo: '위 유보 추인의 상대 조정(자본 감소분)' }
        );
      } else {
        rows.push(
          { fiscal_year: fiscalYear, item_name: AFS_COUNTER_ITEM, adjust_type: '익금산입', amount: p.amount, disposal: '기타', memo: '당기 평가익 계상분(자본 증가)' },
          { fiscal_year: fiscalYear, item_name: AFS_RESERVE_ITEM, adjust_type: '손금산입', amount: p.amount, disposal: '△유보', account_id: acct.account_id, memo: '세무상 취득원가 환원 — 매도 시 익금산입으로 추인' }
        );
      }
    }
    await supabase.from('tax_adjustments').insert(rows);
    renderTaxAdjustments(container);
  };
}
