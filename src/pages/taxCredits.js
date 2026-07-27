import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';
import { exportTableToExcel, exportButtonHtml } from '../lib/exportExcel.js';
import { CREDIT_TYPES, PREPAID_TYPES } from '../lib/taxAdjust.js';

let year = null;

// 기납부세액·세액공제 관리 — 선납세금(11106) 계정을 세무신고 관점으로 분류한다.
// 같은 계정에 쌓이지만 신고서에서는 자리가 다르다:
//   · 중간예납·원천납부 → 기납부세액 (한도 없이 전액 차감)
//   · 외국납부세액      → 세액공제 (산출세액 × 국외원천소득/과세표준 한도, 초과분 10년 이월)
// 그래서 등록 시 갈래를 지정하게 하고, 선납세금 장부 잔액과 대사해 누락을 잡는다.
export async function renderTaxCredits(container) {
  const years = await fetchFiscalYears();
  if (!year) year = years[years.length - 1] ?? new Date().getFullYear();

  const [{ data: credits, error }, { data: prepaidAcct }] = await Promise.all([
    supabase.from('tax_credits').select('*').eq('fiscal_year', year).order('credit_id'),
    supabase.from('accounts').select('account_id').eq('account_code', '11106').maybeSingle(),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  // 선납세금 장부 잔액(해당 연도 발생분) — 등록 누락 대사용
  let glLines = [];
  if (prepaidAcct) {
    const { data } = await supabase
      .from('journal_lines')
      .select('entry_id, debit_amount, credit_amount, journal_entries!inner(entry_date, description, status)')
      .eq('account_id', prepaidAcct.account_id)
      .eq('journal_entries.status', 'posted')
      .gte('journal_entries.entry_date', `${year}-01-01`)
      .lte('journal_entries.entry_date', `${year}-12-31`);
    glLines = data ?? [];
  }
  const glTotal = glLines.reduce((s, l) => s + Number(l.debit_amount) - Number(l.credit_amount), 0);

  const list = credits ?? [];

  // 미등록분 자동 제안: 적요에 "배당"이 있으면 해외 배당 원천징수(외국납부세액, 세액공제·한도 있음)로,
  // 그 외(예탁금이용료 등 국내 이자 원천징수)는 원천납부(기납부세액, 한도 없음)로 분류한다.
  // 이미 등록된 금액과 정확히 같은 액수가 있으면 "이미 등록됨"으로 보고 건너뛴다(단순 금액 대사 — 여러 건이
  // 우연히 같은 금액이면 놓칠 수 있지만, 그 경우에도 위쪽 '차이' 합계 대사가 잡아준다).
  const remaining = list.map((c) => Number(c.amount));
  const consume = (amt) => {
    const i = remaining.findIndex((r) => Math.abs(r - amt) < 1);
    if (i === -1) return false;
    remaining.splice(i, 1);
    return true;
  };
  let entryLinesByEntry = null;
  const suggestions = [];
  for (const l of glLines) {
    const amt = Number(l.debit_amount) - Number(l.credit_amount);
    if (amt <= 0) continue;
    if (consume(amt)) continue; // 이미 등록됨
    const desc = l.journal_entries.description ?? '';
    const isDividend = desc.includes('배당');
    let foreignIncome = null;
    if (isDividend) {
      if (!entryLinesByEntry) {
        const { data: allLines } = await supabase.from('journal_lines').select('entry_id, account_id, credit_amount').in('entry_id', glLines.map((x) => x.entry_id));
        entryLinesByEntry = {};
        for (const el of allLines ?? []) {
          entryLinesByEntry[el.entry_id] = entryLinesByEntry[el.entry_id] ?? [];
          entryLinesByEntry[el.entry_id].push(el);
        }
      }
      const siblings = entryLinesByEntry[l.entry_id] ?? [];
      foreignIncome = Math.max(0, ...siblings.map((el) => Number(el.credit_amount)));
    }
    suggestions.push({ date: l.journal_entries.entry_date, desc, amount: amt, type: isDividend ? '외국납부세액' : '원천납부', foreignIncome: isDividend ? foreignIncome : null });
  }
  const prepaidTotal = list.filter((c) => PREPAID_TYPES.includes(c.credit_type)).reduce((s, c) => s + Number(c.amount), 0);
  const creditTotal = list.filter((c) => !PREPAID_TYPES.includes(c.credit_type)).reduce((s, c) => s + Number(c.amount), 0);
  const registered = prepaidTotal + creditTotal;
  const gap = glTotal - registered;

  const rows = list
    .map(
      (c) => `<tr data-id="${c.credit_id}">
        <td class="c">${esc(c.credit_type)}</td>
        <td class="num">${fmt(c.amount)}</td>
        <td class="num">${c.foreign_income ? fmt(c.foreign_income) : '–'}</td>
        <td class="c">${esc(c.paid_date ?? '')}</td>
        <td>${esc(c.memo ?? '')}</td>
        <td class="c"><button type="button" class="btn ghost sm delBtn">삭제</button></td>
      </tr>`
    )
    .join('');

  const glRows = glLines
    .map(
      (l) => `<tr>
        <td class="c">${esc(l.journal_entries.entry_date)}</td>
        <td>${esc(l.journal_entries.description ?? '')}</td>
        <td class="num">${fmt(Number(l.debit_amount) - Number(l.credit_amount))}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>기납부세액 · 세액공제</h2>
    <div class="toolbar">
      <label>사업연도: </label>
      <select id="crYear">${years.map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      ${exportButtonHtml('crExport')}
    </div>
    <p class="note">
      <b>중간예납·원천납부</b>는 이미 낸 세금이라 산출세액에서 한도 없이 차감됩니다.
      <b>외국납부세액</b>은 세액공제라 <i>산출세액 × (국외원천소득 ÷ 과세표준)</i> 한도가 걸리고, 초과분은 10년간 이월됩니다.
    </p>

    <div style="overflow-x:auto"><table id="crTable">
      <tr><th>구분</th><th>금액(원)</th><th>국외원천소득</th><th>납부일</th><th>비고</th><th></th></tr>
      ${rows || '<tr><td colspan="6" class="note">등록된 내역이 없습니다.</td></tr>'}
      ${list.length ? `<tr><td><b>합계</b></td><td class="num"><b>${fmt(registered)}</b></td><td colspan="4"></td></tr>` : ''}
    </table></div>

    ${suggestions.length ? `
    <div class="card" style="background:#fff8e1;border-color:#e0c060;margin-top:16px">
      <p><b>확인 필요:</b> 선납세금 장부에 있는데 등록되지 않은 항목 ${suggestions.length}건을 찾았습니다. 적요를 보고 아래처럼 분류를 제안합니다 — 배당이면 해외 배당 원천징수(외국납부세액), 그 외면 국내 원천징수(원천납부)로 봤습니다.</p>
      <table style="margin:8px 0">
        <tr><th>일자</th><th>적요</th><th>금액</th><th>제안 구분</th><th>국외원천소득</th></tr>
        ${suggestions.map((s) => `<tr><td class="c">${esc(s.date)}</td><td>${esc(s.desc)}</td><td class="num">${fmt(s.amount)}</td><td class="c">${s.type}</td><td class="num">${s.foreignIncome ? fmt(s.foreignIncome) : '–'}</td></tr>`).join('')}
      </table>
      <button class="btn" id="crAutoAdd">전부 등록</button>
      <span class="note">분류가 틀렸으면 등록 후 아래 표에서 삭제하고 직접 다시 입력하세요.</span>
    </div>
    ` : ''}

    <h3 style="margin-top:20px">추가</h3>
    <form class="toolbar" id="crForm">
      <div><label class="note">구분</label><br><select id="c_type">${CREDIT_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
      <div><label class="note">금액</label><br><input type="number" id="c_amount" required></div>
      <div><label class="note">국외원천소득 <span class="note">(외국납부세액만)</span></label><br><input type="number" id="c_foreign"></div>
      <div><label class="note">납부일</label><br><input type="date" id="c_date"></div>
      <div><label class="note">비고</label><br><input type="text" id="c_memo"></div>
      <button class="btn" type="submit">추가</button>
      <span class="err" id="crErr"></span>
    </form>

    <h3 style="margin-top:24px">선납세금 계정 대사 (${year}년)</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>적요</th><th>금액(원)</th></tr>
      ${glRows || '<tr><td colspan="3" class="note">해당 연도 선납세금 발생액이 없습니다.</td></tr>'}
      <tr><td colspan="2"><b>선납세금 장부 발생액</b></td><td class="num"><b>${fmt(glTotal)}</b></td></tr>
      <tr><td colspan="2">위 등록 합계</td><td class="num">${fmt(registered)}</td></tr>
      <tr><td colspan="2"><b>차이</b></td><td class="num"><b>${fmt(gap)}</b>
        ${Math.abs(gap) < 1 ? ' <span class="badge ok">일치 ✓</span>' : ' <span class="badge bad">미등록분 있음</span>'}</td></tr>
    </table></div>
    ${Math.abs(gap) >= 1 ? '<p class="note">장부에는 있으나 위에 등록되지 않은 금액이 있습니다. 신고 시 누락되지 않도록 구분을 정해 등록하세요.</p>' : ''}
  </div>`;

  document.getElementById('crYear').addEventListener('change', (ev) => {
    year = Number(ev.target.value);
    renderTaxCredits(container);
  });
  document.getElementById('crExport').onclick = () =>
    exportTableToExcel(document.getElementById('crTable'), `기납부세액_${year}.xlsx`);

  document.getElementById('crForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('crErr');
    errEl.textContent = '';
    const type = document.getElementById('c_type').value;
    const foreign = Number(document.getElementById('c_foreign').value) || null;
    if (type === '외국납부세액' && !foreign) {
      errEl.textContent = '외국납부세액은 공제한도 계산을 위해 국외원천소득이 필요합니다.';
      return;
    }
    const { error: insErr } = await supabase.from('tax_credits').insert({
      fiscal_year: year,
      credit_type: type,
      amount: Number(document.getElementById('c_amount').value) || 0,
      foreign_income: type === '외국납부세액' ? foreign : null,
      paid_date: document.getElementById('c_date').value || null,
      memo: document.getElementById('c_memo').value.trim() || null,
    });
    if (insErr) {
      errEl.textContent = '저장 실패: ' + insErr.message;
      return;
    }
    renderTaxCredits(container);
  });

  document.getElementById('crAutoAdd')?.addEventListener('click', async () => {
    const rows = suggestions.map((s) => ({
      fiscal_year: year,
      credit_type: s.type,
      amount: s.amount,
      foreign_income: s.foreignIncome || null,
      paid_date: s.date,
      memo: `자동 제안(적요: ${s.desc})`,
    }));
    await supabase.from('tax_credits').insert(rows);
    renderTaxCredits(container);
  });

  container.querySelectorAll('.delBtn').forEach((btn) => {
    btn.onclick = async () => {
      await supabase.from('tax_credits').delete().eq('credit_id', Number(btn.closest('tr').dataset.id));
      renderTaxCredits(container);
    };
  });
}
