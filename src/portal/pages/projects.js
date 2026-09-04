import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';
import { renderGanttChart } from '../lib/gantt.js';
import { PROJECT_CATEGORIES } from '../lib/projectCategories.js';

const TASK_STATUSES = ['시작전', '진행중', '완료'];

let mode = 'list'; // 'list' | 'new' | 'view'
let currentProjectId = null;
let selectedDeptId = null;
let categoryFilter = 'all';
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentProjectId = null;
}

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

function progressOf(tasks) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === '완료').length / tasks.length) * 100);
}

export async function renderProjects(container) {
  const departments = await fetchDepartments({ activeOnly: true });
  if (departments.length === 0) {
    container.innerHTML = '<div class="card"><p class="note">등록된 부서가 없습니다. [기초정보 &gt; 부서관리]에서 먼저 부서를 추가하세요.</p></div>';
    return;
  }
  if (selectedDeptId == null || !departments.some((d) => d.dept_id === selectedDeptId)) {
    selectedDeptId = departments[0].dept_id;
  }

  if (mode === 'list') return renderList(container, departments);
  if (mode === 'new') return renderForm(container, departments);
  return renderProjectDetailView(container, currentProjectId, { readOnly: false, onBack: resetView });
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

async function renderList(container, departments) {
  const { data: allProjects, error } = await supabase
    .from('projects')
    .select('*, project_tasks(status)')
    .eq('dept_id', selectedDeptId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">프로젝트 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  // 연도 필터와 업무종류 필터는 서로 독립 — 업무종류만 고르고 연도를 "전체"로 두면
  // 그 부서의 전체 기간 해당 업무종류 프로젝트를 다 볼 수 있다.
  const years = [...new Set(allProjects.map((p) => yearOf(p.created_at)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());
  const projects = allProjects.filter(
    (p) => (categoryFilter === 'all' || p.category === categoryFilter) && (yearFilter === 'all' || yearOf(p.created_at) === Number(yearFilter))
  );

  const deptOptions = departments.map((d) => `<option value="${d.dept_id}" ${d.dept_id === selectedDeptId ? 'selected' : ''}>${esc(d.dept_name)}</option>`).join('');
  const categoryOptions = ['<option value="all">전체 업무종류</option>', ...PROJECT_CATEGORIES.map((c) => `<option value="${c}" ${categoryFilter === c ? 'selected' : ''}>${c}</option>`)].join('');
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = projects
    .map((p) => {
      const tasks = p.project_tasks ?? [];
      const pct = progressOf(tasks);
      return `<tr>
        <td class="c">${esc(p.category)}</td>
        <td><a href="#" data-open="${p.project_id}">${esc(p.title)}</a></td>
        <td class="c">${tasks.length}건</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--brand)"></div></div>
            <span class="note" style="width:36px;text-align:right">${pct}%</span>
          </div>
        </td>
        <td class="c">${p.end_date ?? ''}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <label style="margin-right:4px">부서</label>
      <select id="deptSel">${deptOptions}</select>
      <select id="catSel" style="margin-left:8px">${categoryOptions}</select>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn" id="newProjBtn" style="margin-left:auto">새 프로젝트</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>업무종류</th><th>프로젝트명</th><th>업무 수</th><th>진행률</th><th>종료 예정</th></tr>
      ${rows || '<tr><td colspan="5" class="note" style="text-align:center">해당하는 진행 중인 프로젝트가 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('deptSel').onchange = (ev) => { selectedDeptId = Number(ev.target.value); renderProjects(container); };
  document.getElementById('catSel').onchange = (ev) => { categoryFilter = ev.target.value; renderProjects(container); };
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderProjects(container); };
  document.getElementById('newProjBtn').onclick = () => { mode = 'new'; renderProjects(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentProjectId = Number(a.dataset.open); mode = 'view'; renderProjects(container); };
  });
}

async function renderForm(container, departments) {
  const deptOptions = departments.map((d) => `<option value="${d.dept_id}" ${d.dept_id === selectedDeptId ? 'selected' : ''}>${esc(d.dept_name)}</option>`).join('');
  const categoryOptions = PROJECT_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

  container.innerHTML = `
  <div class="card">
    <h2>새 프로젝트</h2>
    <form class="entry" id="projForm">
      <div style="grid-column:span 4"><label>부서 *</label><select id="f_dept">${deptOptions}</select></div>
      <div style="grid-column:span 4"><label>업무종류 *</label><select id="f_cat">${categoryOptions}</select></div>
      <div style="grid-column:span 2"><label>시작일</label><input id="f_start" type="date" value="${todayStr()}"></div>
      <div style="grid-column:span 2"><label>종료 예정일</label><input id="f_end" type="date"></div>
      <div style="grid-column:span 12"><label>프로젝트명 *</label><input id="f_title" type="text" required></div>
      <div style="grid-column:span 12"><label>개요/목적</label><textarea id="f_desc" rows="4" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical"></textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">만들기</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="projErr"></span>
      </div>
    </form>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => { resetView(); renderProjects(container); };

  document.getElementById('projForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('projErr');
    errEl.textContent = '';
    const email = await currentUserEmail();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        dept_id: Number(document.getElementById('f_dept').value),
        category: document.getElementById('f_cat').value,
        title: document.getElementById('f_title').value.trim(),
        description: document.getElementById('f_desc').value.trim() || null,
        start_date: document.getElementById('f_start').value || null,
        end_date: document.getElementById('f_end').value || null,
        created_by: email,
      })
      .select()
      .single();
    if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
    selectedDeptId = data.dept_id;
    currentProjectId = data.project_id;
    mode = 'view';
    renderProjects(container);
  });
}

// 진행 중/아카이브 화면이 같이 쓰는 상세 렌더러. readOnly=true면 업무 편집·메모 작성·완료처리가
// 전부 숨겨지고 조회(+첨부파일 열람)만 가능하다.
export async function renderProjectDetailView(container, projectId, { readOnly, onBack }) {
  const [{ data: project, error: pErr }, { data: tasks, error: tErr }, { data: notes, error: nErr }, departments] = await Promise.all([
    supabase.from('projects').select('*').eq('project_id', projectId).single(),
    supabase.from('project_tasks').select('*').eq('project_id', projectId).order('sort_order').order('start_date'),
    supabase.from('project_notes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    fetchDepartments(),
  ]);
  if (pErr) {
    container.innerHTML = `<div class="card"><p class="err">프로젝트 조회 실패: ${esc(pErr.message)}</p></div>`;
    return;
  }
  if (tErr || nErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc((tErr ?? nErr).message)}</p></div>`;
    return;
  }

  const deptName = departments.find((d) => d.dept_id === project.dept_id)?.dept_name ?? '';
  const pct = progressOf(tasks);

  const taskRows = tasks
    .map(
      (t) => `<tr>
        <td>${readOnly ? esc(t.title) : `<input type="text" data-task="${t.task_id}" data-field="title" value="${esc(t.title)}" style="width:100%">`}</td>
        <td>${readOnly ? esc(t.assignee ?? '') : `<input type="text" data-task="${t.task_id}" data-field="assignee" value="${esc(t.assignee ?? '')}" style="width:100%">`}</td>
        <td class="c">${readOnly ? (t.start_date ?? '') : `<input type="date" data-task="${t.task_id}" data-field="start_date" value="${t.start_date ?? ''}">`}</td>
        <td class="c">${readOnly ? (t.due_date ?? '') : `<input type="date" data-task="${t.task_id}" data-field="due_date" value="${t.due_date ?? ''}">`}</td>
        <td class="c">${
          readOnly
            ? `<span class="badge ${t.status === '완료' ? 'ok' : t.status === '진행중' ? 'draft' : ''}">${esc(t.status)}</span>`
            : `<select data-task="${t.task_id}" data-field="status">${TASK_STATUSES.map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`
        }</td>
        ${readOnly ? '' : `<td class="c"><button class="btn sm ghost" data-del-task="${t.task_id}">삭제</button></td>`}
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">${esc(project.title)}</h2>
      <span class="badge ${project.status === 'archived' ? 'bad' : 'ok'}">${project.status === 'archived' ? '완료(아카이브)' : '진행중'}</span>
      <span class="badge draft">${esc(project.category)}</span>
      <span class="note" style="margin-left:8px">${esc(deptName)} · 진행률 ${pct}%</span>
      <span style="margin-left:auto">
        ${!readOnly && project.status === 'active' ? '<button class="btn" id="archiveBtn">완료 처리(아카이브)</button>' : ''}
        ${readOnly && project.status === 'archived' ? '<button class="btn ghost" id="reopenBtn">재오픈</button>' : ''}
        <button class="btn ghost" id="backBtn">목록</button>
      </span>
    </div>
    ${project.description ? `<p class="note" style="white-space:pre-wrap">${esc(project.description)}</p>` : ''}
    <p class="note">${project.start_date ?? '?'} ~ ${project.end_date ?? '?'}</p>
  </div>

  <div class="card">
    <h2>업무 목록</h2>
    <div style="overflow-x:auto"><table>
      <tr><th>업무명</th><th>담당자</th><th>시작일</th><th>기한</th><th>상태</th>${readOnly ? '' : '<th></th>'}</tr>
      ${taskRows || `<tr><td colspan="${readOnly ? 5 : 6}" class="note" style="text-align:center">등록된 업무가 없습니다.</td></tr>`}
    </table></div>
    ${
      readOnly
        ? ''
        : `<form class="entry" id="taskForm" style="margin-top:14px">
      <div style="grid-column:span 4"><label>업무명 *</label><input id="nt_title" type="text" required></div>
      <div style="grid-column:span 3"><label>담당자</label><input id="nt_assignee" type="text"></div>
      <div style="grid-column:span 2"><label>시작일</label><input id="nt_start" type="date"></div>
      <div style="grid-column:span 2"><label>기한</label><input id="nt_due" type="date"></div>
      <div style="grid-column:span 1"><label>&nbsp;</label><button class="btn" type="submit" style="width:100%">추가</button></div>
    </form>`
    }
    <h3 style="margin-top:20px">일정(간트)</h3>
    ${renderGanttChart(tasks)}
  </div>

  <div class="card">
    <h2>진행 메모</h2>
    ${
      readOnly
        ? ''
        : `<form id="noteForm" class="toolbar" style="margin-bottom:12px">
      <input type="text" id="nt_note" placeholder="예: 임시총회 소집통지서 초안 작성함" style="flex:1">
      <button class="btn sm" type="submit">기록</button>
    </form>`
    }
    ${
      notes.length
        ? `<table><tr><th>내용</th><th>작성</th><th>일시</th></tr>${notes
            .map((n) => `<tr><td>${esc(n.body)}</td><td class="c">${esc(n.author_email ?? '')}</td><td class="c">${String(n.created_at).slice(0, 16).replace('T', ' ')}</td></tr>`)
            .join('')}</table>`
        : '<p class="note">기록된 메모가 없습니다.</p>'
    }
  </div>

  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = onBack;

  const archiveBtn = document.getElementById('archiveBtn');
  if (archiveBtn) {
    archiveBtn.onclick = async () => {
      if (!confirm('이 프로젝트를 완료 처리하시겠습니까? 완료 후에는 부서자료(아카이브)에서 읽기전용으로 보입니다.')) return;
      const { error: archErr } = await supabase.from('projects').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('project_id', projectId);
      if (archErr) { alert('처리 실패: ' + archErr.message); return; }
      onBack();
    };
  }

  const reopenBtn = document.getElementById('reopenBtn');
  if (reopenBtn) {
    reopenBtn.onclick = async () => {
      const { error: reErr } = await supabase.from('projects').update({ status: 'active', archived_at: null }).eq('project_id', projectId);
      if (reErr) { alert('처리 실패: ' + reErr.message); return; }
      onBack();
    };
  }

  if (!readOnly) {
    container.querySelectorAll('[data-task]').forEach((el) => {
      el.onchange = async () => {
        const taskId = Number(el.dataset.task);
        const field = el.dataset.field;
        const value = el.value || null;
        const { error: upErr } = await supabase.from('project_tasks').update({ [field]: value, updated_at: new Date().toISOString() }).eq('task_id', taskId);
        if (upErr) alert('저장 실패: ' + upErr.message);
        else renderProjectDetailView(container, projectId, { readOnly, onBack });
      };
    });

    container.querySelectorAll('[data-del-task]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('업무를 삭제할까요?')) return;
        const { error: delErr } = await supabase.from('project_tasks').delete().eq('task_id', Number(b.dataset.delTask));
        if (delErr) { alert('삭제 실패: ' + delErr.message); return; }
        renderProjectDetailView(container, projectId, { readOnly, onBack });
      };
    });

    document.getElementById('taskForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const { error: insErr } = await supabase.from('project_tasks').insert({
        project_id: projectId,
        title: document.getElementById('nt_title').value.trim(),
        assignee: document.getElementById('nt_assignee').value.trim() || null,
        start_date: document.getElementById('nt_start').value || null,
        due_date: document.getElementById('nt_due').value || null,
        sort_order: tasks.length,
      });
      if (insErr) { alert('추가 실패: ' + insErr.message); return; }
      renderProjectDetailView(container, projectId, { readOnly, onBack });
    });

    document.getElementById('noteForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const input = document.getElementById('nt_note');
      const body = input.value.trim();
      if (!body) return;
      const email = await currentUserEmail();
      const { error: noteErr } = await supabase.from('project_notes').insert({ project_id: projectId, body, author_email: email });
      if (noteErr) { alert('기록 실패: ' + noteErr.message); return; }
      renderProjectDetailView(container, projectId, { readOnly, onBack });
    });
  }

  const email = await currentUserEmail();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'project', projectId, email);
}
