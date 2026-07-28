import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchPeriodIdForDate, fetchMaxEntryNo, formatEntryNo } from '../lib/data.js';
import { todayStr } from '../lib/util.js';
import { CATEGORY_ORDER, leafAccounts, categoryOptionsHtml, accountOptionsHtml } from '../lib/accountPicker.js';

export async function renderJournalEntry(container) {
  const accounts = await fetchAccounts({ activeOnly: true });
  const accountById = (id) => accounts.find((a) => String(a.account_id) === String(id));

  // 입금(그 계정이 자연스럽게 늘어나는 방향)/출금(줄어드는 방향)으로 고르게 하고,
  // 실제 차변/대변은 계정의 정상잔액 방향에 따라 자동으로 계산해 옆에 병기한다.
  function computeSide(accountId, dir) {
    const acc = accountById(accountId);
    if (!acc) return null;
    const isIncrease = dir === 'in';
    const normalDebit = acc.normal_balance === 'debit';
    return isIncrease === normalDebit ? 'debit' : 'credit';
  }

  function updateSideLabel(row) {
    const side = computeSide(row.querySelector('.l_acct').value, row.querySelector('.l_dir').value);
    row.querySelector('.l_side').textContent = side ? (side === 'debit' ? '(차변)' : '(대변)') : '';
  }

  container.innerHTML = `
  <div class="card">
    <h2>수기 분개 입력</h2>
    <form id="jeForm">
      <div class="toolbar">
        <div><label class="note">날짜</label><br><input type="date" id="f_date" value="${todayStr()}" required></div>
        <div style="flex:1"><label class="note">적요</label><br><input id="f_desc" placeholder="예: 부가가치세 납부" style="width:100%;padding:7px;border:1px solid var(--bd);border-radius:5px;"></div>
      </div>
      <div id="linesBox"></div>
      <div class="toolbar">
        <button type="button" class="btn ghost sm" id="addLine">+ 줄 추가</button>
        <span id="balanceInfo" class="note"></span>
      </div>
      <div class="toolbar">
        <button type="submit" class="btn" id="saveBtn" disabled>임시저장 (draft)</button>
        <span class="err" id="jeErr"></span>
      </div>
      <p class="note">계정마다 "입금(증가)"인지 "출금(감소)"인지만 고르면 차변/대변은 자동으로 계산되어 옆에 표시됩니다. 저장은 draft 상태로만 됩니다 — 실제 장부 반영(전기)은 [분개장] 탭에서 승인해야 합니다.</p>
    </form>
  </div>`;

  const linesBox = document.getElementById('linesBox');
  const saveBtn = document.getElementById('saveBtn');
  const errEl = document.getElementById('jeErr');
  const balanceInfo = document.getElementById('balanceInfo');

  function addRow() {
    const row = document.createElement('div');
    row.className = 'line-row';
    row.innerHTML = `
      <select class="l_cat">${categoryOptionsHtml(CATEGORY_ORDER[0])}</select>
      <select class="l_acct">${accountOptionsHtml(accounts, leafAccounts(accounts, CATEGORY_ORDER[0]), null, { placeholder: true })}</select>
      <select class="l_dir">
        <option value="in">입금(증가)</option>
        <option value="out">출금(감소)</option>
      </select>
      <input class="l_amt" type="number" min="0" step="1" placeholder="금액">
      <span class="l_side note"></span>
      <select class="l_seg">
        <option value="">부문(선택)</option>
        <option value="invest">투자</option>
        <option value="commerce">상거래</option>
        <option value="common">공통</option>
      </select>
      <button type="button" class="btn sm danger removeLine">삭제</button>`;
    linesBox.appendChild(row);
    updateSideLabel(row);
  }
  addRow();
  addRow();

  document.getElementById('addLine').onclick = addRow;

  linesBox.addEventListener('change', (ev) => {
    const row = ev.target.closest('.line-row');
    if (!row) return;
    if (ev.target.classList.contains('l_cat')) {
      // 분류(카테고리)를 바꾸면 그 줄의 계정 목록만 다시 좁혀 채운다.
      row.querySelector('.l_acct').innerHTML = accountOptionsHtml(accounts, leafAccounts(accounts, ev.target.value), null, { placeholder: true });
    }
    if (ev.target.classList.contains('l_cat') || ev.target.classList.contains('l_acct') || ev.target.classList.contains('l_dir')) {
      updateSideLabel(row);
    }
  });

  function recalc() {
    let dr = 0;
    let cr = 0;
    let filled = 0;
    linesBox.querySelectorAll('.line-row').forEach((r) => {
      const accountId = r.querySelector('.l_acct').value;
      const amt = Number(r.querySelector('.l_amt').value) || 0;
      if (!accountId || !amt) return;
      filled++;
      const side = computeSide(accountId, r.querySelector('.l_dir').value);
      if (side === 'debit') dr += amt;
      else if (side === 'credit') cr += amt;
    });
    const balanced = dr === cr && dr > 0 && filled >= 2;
    balanceInfo.innerHTML =
      `차변 ${dr.toLocaleString()} / 대변 ${cr.toLocaleString()} ` +
      (balanced ? '<span class="badge ok">일치</span>' : '<span class="badge bad">불일치</span>');
    saveBtn.disabled = !balanced;
    return balanced;
  }

  linesBox.addEventListener('input', recalc);
  linesBox.addEventListener('change', recalc);
  linesBox.addEventListener('click', (ev) => {
    if (ev.target.classList.contains('removeLine')) {
      ev.target.closest('.line-row').remove();
      recalc();
    }
  });
  recalc();

  document.getElementById('jeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!recalc()) return;
    errEl.textContent = '';

    const rows = [...linesBox.querySelectorAll('.line-row')]
      .map((r) => {
        const accountId = r.querySelector('.l_acct').value || null;
        const amt = Number(r.querySelector('.l_amt').value) || 0;
        const side = accountId ? computeSide(accountId, r.querySelector('.l_dir').value) : null;
        return {
          account_id: accountId,
          debit_amount: side === 'debit' ? amt : 0,
          credit_amount: side === 'credit' ? amt : 0,
          segment: r.querySelector('.l_seg').value || null,
        };
      })
      .filter((l) => l.account_id && (l.debit_amount || l.credit_amount));

    const entryDate = document.getElementById('f_date').value;
    let periodId;
    try {
      periodId = await fetchPeriodIdForDate(entryDate);
    } catch (err) {
      errEl.textContent = '회계기간 조회 실패: ' + err.message;
      return;
    }
    if (!periodId) {
      errEl.textContent = `${entryDate.slice(0, 4)}년 회계기간이 등록되어 있지 않습니다.`;
      return;
    }

    saveBtn.disabled = true;

    let entryNo = null;
    try {
      entryNo = formatEntryNo((await fetchMaxEntryNo(Number(entryDate.slice(0, 4)))) + 1);
    } catch {
      entryNo = null; // 채번 실패해도 분개 저장 자체는 막지 않음(번호는 표시용)
    }

    const { data: entry, error: e1 } = await supabase
      .from('journal_entries')
      .insert({
        entry_no: entryNo,
        entry_date: entryDate,
        period_id: periodId,
        description: document.getElementById('f_desc').value.trim() || null,
        source_type: 'manual',
        status: 'draft',
      })
      .select()
      .single();

    if (e1) {
      errEl.textContent = '저장 실패: ' + e1.message;
      saveBtn.disabled = false;
      return;
    }

    const { error: e2 } = await supabase.from('journal_lines').insert(rows.map((l) => ({ ...l, entry_id: entry.entry_id })));

    if (e2) {
      errEl.textContent = '저장 실패(분개상세): ' + e2.message;
      await supabase.from('journal_entries').delete().eq('entry_id', entry.entry_id);
      saveBtn.disabled = false;
      return;
    }

    alert('임시저장(draft) 완료. [분개장] 탭에서 전기(승인)하세요.');
    renderJournalEntry(container);
  });
}
