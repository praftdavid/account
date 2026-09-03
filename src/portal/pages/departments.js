import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { fetchDepartments } from '../lib/departments.js';

let editingId = null;

export async function renderDepartments(container) {
  const departments = await fetchDepartments();
  const editing = editingId ? departments.find((d) => d.dept_id === editingId) : null;

  const rows = departments
    .map(
      (d) => `<tr class="${d.is_active ? '' : 'inactive'}">
        <td>${esc(d.dept_name)}</td>
        <td class="c">${esc(d.dept_code ?? '')}</td>
        <td class="c">${d.sort_order}</td>
        <td class="c">
          <button class="btn sm ghost" data-edit="${d.dept_id}">수정</button>
          <button class="btn sm ghost" data-toggle="${d.dept_id}">${d.is_active ? '비활성화' : '활성화'}</button>
        </td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>부서 목록 (${departments.length}건)</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>부서명</th><th>코드</th><th>정렬순서</th><th></th></tr>
      ${rows}
    </table></div>
  </div>
  <div class="card">
    <h2>${editing ? `부서 수정 — ${esc(editing.dept_name)}` : '부서 추가'}</h2>
    <form class="entry" id="deptForm">
      <div style="grid-column:span 5"><label>부서명 *</label><input id="f_name" required value="${esc(editing?.dept_name ?? '')}"></div>
      <div style="grid-column:span 4"><label>코드</label><input id="f_code" value="${esc(editing?.dept_code ?? '')}"></div>
      <div style="grid-column:span 3"><label>정렬순서</label><input type="number" id="f_sort" value="${editing?.sort_order ?? 0}"></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">${editing ? '수정 저장' : '추가'}</button>
        ${editing ? '<button class="btn ghost" type="button" id="cancelEdit">취소</button>' : ''}
        <span class="err" id="deptErr"></span>
      </div>
    </form>
  </div>`;

  container.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      editingId = Number(b.dataset.edit);
      renderDepartments(container);
    };
  });

  container.querySelectorAll('[data-toggle]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.toggle);
      const dept = departments.find((d) => d.dept_id === id);
      const { error } = await supabase.from('departments').update({ is_active: !dept.is_active }).eq('dept_id', id);
      if (error) {
        alert('변경 실패: ' + error.message);
        return;
      }
      renderDepartments(container);
    };
  });

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.onclick = () => { editingId = null; renderDepartments(container); };

  document.getElementById('deptForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('deptErr');
    errEl.textContent = '';

    const payload = {
      dept_name: document.getElementById('f_name').value.trim(),
      dept_code: document.getElementById('f_code').value.trim() || null,
      sort_order: Number(document.getElementById('f_sort').value) || 0,
    };

    const { error } = editing
      ? await supabase.from('departments').update(payload).eq('dept_id', editing.dept_id)
      : await supabase.from('departments').insert(payload);

    if (error) {
      errEl.textContent = '저장 실패: ' + error.message;
      return;
    }
    editingId = null;
    renderDepartments(container);
  });
}
