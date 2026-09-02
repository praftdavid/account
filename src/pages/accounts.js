import { supabase } from '../lib/supabaseClient.js';
import { esc } from '../lib/util.js';

const TYPE_LABEL = { asset: '자산', liability: '부채', equity: '자본', revenue: '수익', expense: '비용' };

let editingId = null;

function parentLabel(accounts, parentId) {
  if (!parentId) return '';
  const p = accounts.find((a) => a.account_id === parentId);
  return p ? `${p.account_code} ${p.account_name}` : '';
}

export async function renderAccounts(container) {
  const { data: accounts, error } = await supabase.from('accounts').select('*').order('account_code');
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">계정과목 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const editing = editingId ? accounts.find((a) => a.account_id === editingId) : null;

  const rows = accounts
    .map(
      (a) => `<tr class="${a.is_active ? '' : 'inactive'}">
        <td class="c">${esc(a.account_code)}</td>
        <td>${esc(a.account_name)}</td>
        <td class="c">${TYPE_LABEL[a.account_type] ?? a.account_type}</td>
        <td class="c">${a.normal_balance === 'debit' ? '차변' : '대변'}</td>
        <td>${esc(parentLabel(accounts, a.parent_account_id))}</td>
        <td>${esc(a.statement_section ?? '')}</td>
        <td>${esc(a.std_report_code ?? '')}</td>
        <td class="c">
          <button class="btn sm ghost" data-edit="${a.account_id}">수정</button>
          <button class="btn sm ghost" data-toggle="${a.account_id}">${a.is_active ? '비활성화' : '활성화'}</button>
        </td>
      </tr>`
    )
    .join('');

  const parentOptions = accounts
    .map(
      (a) =>
        `<option value="${a.account_id}" ${editing?.parent_account_id === a.account_id ? 'selected' : ''}>${esc(a.account_code)} ${esc(a.account_name)}</option>`
    )
    .join('');

  const typeOptions = Object.entries(TYPE_LABEL)
    .map(([k, l]) => `<option value="${k}" ${editing?.account_type === k ? 'selected' : ''}>${l}</option>`)
    .join('');

  const balOptions = ['debit', 'credit']
    .map((k) => `<option value="${k}" ${editing?.normal_balance === k ? 'selected' : ''}>${k === 'debit' ? '차변' : '대변'}</option>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>계정과목 목록 (${accounts.length}건)</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>코드</th><th>계정명</th><th>유형</th><th>정상잔액</th><th>부모계정</th><th>표시구분</th><th>표준코드</th><th></th></tr>
      ${rows}
    </table></div>
  </div>
  <div class="card">
    <h2>${editing ? `계정 수정 — ${esc(editing.account_code)} ${esc(editing.account_name)}` : '계정 추가'}</h2>
    <form class="entry" id="acctForm">
      <div style="grid-column:span 3"><label>계정코드 *</label><input id="f_code" required value="${esc(editing?.account_code ?? '')}"></div>
      <div style="grid-column:span 4"><label>계정명 *</label><input id="f_name" required value="${esc(editing?.account_name ?? '')}"></div>
      <div style="grid-column:span 2"><label>유형 *</label><select id="f_type">${typeOptions}</select></div>
      <div style="grid-column:span 3"><label>정상잔액 *</label><select id="f_bal">${balOptions}</select></div>
      <div style="grid-column:span 6"><label>부모계정</label><select id="f_parent"><option value="">(최상위)</option>${parentOptions}</select></div>
      <div style="grid-column:span 3"><label>표시구분</label><input id="f_section" value="${esc(editing?.statement_section ?? '')}"></div>
      <div style="grid-column:span 3"><label>표준재무제표코드</label><input id="f_std" value="${esc(editing?.std_report_code ?? '')}"></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">${editing ? '수정 저장' : '추가'}</button>
        ${editing ? '<button class="btn ghost" type="button" id="cancelEdit">취소</button>' : ''}
        <span class="err" id="acctErr"></span>
      </div>
    </form>
  </div>`;

  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      editingId = Number(b.dataset.edit);
      renderAccounts(container);
    };
  });

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.toggle);
      const acc = accounts.find((a) => a.account_id === id);
      const { error: toggleErr } = await supabase.from('accounts').update({ is_active: !acc.is_active }).eq('account_id', id);
      if (toggleErr) {
        alert('변경 실패: ' + toggleErr.message);
        return;
      }
      renderAccounts(container);
    };
  });

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.onclick = () => { editingId = null; renderAccounts(container); };

  document.getElementById('acctForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('acctErr');
    errEl.textContent = '';

    const payload = {
      account_code: document.getElementById('f_code').value.trim(),
      account_name: document.getElementById('f_name').value.trim(),
      account_type: document.getElementById('f_type').value,
      normal_balance: document.getElementById('f_bal').value,
      parent_account_id: document.getElementById('f_parent').value || null,
      statement_section: document.getElementById('f_section').value.trim() || null,
      std_report_code: document.getElementById('f_std').value.trim() || null,
    };

    const { error: saveErr } = editing
      ? await supabase.from('accounts').update(payload).eq('account_id', editing.account_id)
      : await supabase.from('accounts').insert(payload);

    if (saveErr) {
      errEl.textContent = '저장 실패: ' + saveErr.message;
      return;
    }
    editingId = null;
    renderAccounts(container);
  });
}
