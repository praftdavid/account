import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { fetchDepartments } from '../lib/departments.js';
import { renderProjectDetailView } from './projects.js';

// "부서자료" 탭 — 완료(아카이브) 처리된 프로젝트만 부서별로 모아 읽기전용으로 보여준다.
// 진행중 프로젝트 편집은 전부 [프로젝트] 탭 쪽(projects.js)에서 하고, 여기는 조회 전용.
let mode = 'list'; // 'list' | 'view'
let currentProjectId = null;
let selectedDeptId = null;
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentProjectId = null;
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

export async function renderProjectArchive(container) {
  const departments = await fetchDepartments({ activeOnly: true });
  if (departments.length === 0) {
    container.innerHTML = '<div class="card"><p class="note">등록된 부서가 없습니다.</p></div>';
    return;
  }
  if (selectedDeptId == null || !departments.some((d) => d.dept_id === selectedDeptId)) {
    selectedDeptId = departments[0].dept_id;
  }

  if (mode === 'view') return renderProjectDetailView(container, currentProjectId, { readOnly: true, onBack: () => { resetView(); renderProjectArchive(container); } });
  return renderList(container, departments);
}

async function renderList(container, departments) {
  const { data: allProjects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('dept_id', selectedDeptId)
    .eq('status', 'archived')
    .order('archived_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allProjects.map((p) => yearOf(p.archived_at)))].sort((a, b) => b - a);
  const projects = allProjects.filter((p) => yearFilter === 'all' || yearOf(p.archived_at) === Number(yearFilter));

  const deptOptions = departments.map((d) => `<option value="${d.dept_id}" ${d.dept_id === selectedDeptId ? 'selected' : ''}>${esc(d.dept_name)}</option>`).join('');
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = projects
    .map(
      (p) => `<tr>
        <td><a href="#" data-open="${p.project_id}">${esc(p.title)}</a></td>
        <td class="c">${p.start_date ?? ''} ~ ${p.end_date ?? ''}</td>
        <td class="c">${p.archived_at ? String(p.archived_at).slice(0, 10) : ''}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <p class="note" style="margin-bottom:10px">완료(아카이브) 처리된 프로젝트 보관함입니다. 진행 중인 프로젝트는 [전자결재] 옆 [프로젝트] 탭에서 관리하세요.</p>
    <div class="toolbar">
      <label style="margin-right:4px">부서</label>
      <select id="deptSel">${deptOptions}</select>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>프로젝트명</th><th>기간</th><th>완료일</th></tr>
      ${rows || '<tr><td colspan="3" class="note" style="text-align:center">완료된 프로젝트가 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('deptSel').onchange = (ev) => { selectedDeptId = Number(ev.target.value); renderProjectArchive(container); };
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderProjectArchive(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentProjectId = Number(a.dataset.open); mode = 'view'; renderProjectArchive(container); };
  });
}
