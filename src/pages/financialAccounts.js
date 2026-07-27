import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts } from '../lib/data.js';
import { esc } from '../lib/util.js';

const KIND_LABEL = { bank: '은행', securities: '증권' };

let editingId = null;

export async function renderFinancialAccounts(container) {
  const [{ data: finAccounts, error }, accounts] = await Promise.all([
    supabase.from('financial_accounts').select('*, accounts(account_code, account_name)').order('fin_account_id'),
    fetchAccounts({ activeOnly: true }),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const editing = editingId ? finAccounts.find((a) => a.fin_account_id === editingId) : null;

  const rows = finAccounts
    .map(
      (a) => `<tr class="${a.is_active ? '' : 'inactive'}">
        <td class="c">${KIND_LABEL[a.account_kind] ?? a.account_kind}</td>
        <td>${esc(a.institution_name)}</td>
        <td>${esc(a.account_no_masked ?? '')}</td>
        <td>${esc(a.accounts ? `${a.accounts.account_code} ${a.accounts.account_name}` : '')}</td>
        <td class="c">
          <button class="btn sm ghost" data-edit="${a.fin_account_id}">수정</button>
          <button class="btn sm ${a.is_active ? 'danger' : ''}" data-toggle="${a.fin_account_id}">${a.is_active ? '비활성화' : '활성화'}</button>
        </td>
      </tr>`
    )
    .join('');

  const glOptions = accounts
    .map((a) => `<option value="${a.account_id}" ${editing?.linked_gl_account_id === a.account_id ? 'selected' : ''}>${esc(a.account_code)} ${esc(a.account_name)}</option>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>금융계좌 목록 (${finAccounts.length}건)</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>구분</th><th>기관명</th><th>계좌번호</th><th>연결 GL계정</th><th></th></tr>
      ${rows || '<tr><td colspan="5" class="note">등록된 계좌가 없습니다.</td></tr>'}
    </table></div>
  </div>
  <div class="card">
    <h2>${editing ? `계좌 수정 — ${esc(editing.institution_name)}` : '계좌 추가'}</h2>
    <form class="entry" id="finForm">
      <div style="grid-column:span 3"><label>구분 *</label>
        <select id="f_kind">
          <option value="bank" ${editing?.account_kind === 'bank' ? 'selected' : ''}>은행</option>
          <option value="securities" ${editing?.account_kind === 'securities' ? 'selected' : ''}>증권</option>
        </select>
      </div>
      <div style="grid-column:span 4"><label>기관명 *</label><input id="f_inst" required value="${esc(editing?.institution_name ?? '')}"></div>
      <div style="grid-column:span 3"><label>계좌번호(마스킹)</label><input id="f_acctno" value="${esc(editing?.account_no_masked ?? '')}"></div>
      <div style="grid-column:span 12"><label>연결 GL계정 *</label><select id="f_gl">${glOptions}</select></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">${editing ? '수정 저장' : '추가'}</button>
        ${editing ? '<button class="btn ghost" type="button" id="cancelEdit">취소</button>' : ''}
        <span class="err" id="finErr"></span>
      </div>
    </form>
  </div>`;

  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      editingId = Number(b.dataset.edit);
      renderFinancialAccounts(container);
    };
  });

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.toggle);
      const acc = finAccounts.find((a) => a.fin_account_id === id);
      const { error: toggleErr } = await supabase.from('financial_accounts').update({ is_active: !acc.is_active }).eq('fin_account_id', id);
      if (toggleErr) {
        alert('변경 실패: ' + toggleErr.message);
        return;
      }
      renderFinancialAccounts(container);
    };
  });

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.onclick = () => { editingId = null; renderFinancialAccounts(container); };

  document.getElementById('finForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('finErr');
    errEl.textContent = '';

    const payload = {
      account_kind: document.getElementById('f_kind').value,
      institution_name: document.getElementById('f_inst').value.trim(),
      account_no_masked: document.getElementById('f_acctno').value.trim() || null,
      linked_gl_account_id: Number(document.getElementById('f_gl').value),
    };

    const { error: saveErr } = editing
      ? await supabase.from('financial_accounts').update(payload).eq('fin_account_id', editing.fin_account_id)
      : await supabase.from('financial_accounts').insert(payload);

    if (saveErr) {
      errEl.textContent = '저장 실패: ' + saveErr.message;
      return;
    }
    editingId = null;
    renderFinancialAccounts(container);
  });
}
