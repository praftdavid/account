import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { fetchDepartments } from '../lib/departments.js';

function dateStr(ts) {
  return ts ? String(ts).slice(0, 10) : '';
}

function progressOf(tasks) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === '완료').length / tasks.length) * 100);
}

function nearestDue(tasks) {
  const upcoming = tasks.filter((t) => t.due_date && t.status !== '완료').sort((a, b) => a.due_date.localeCompare(b.due_date));
  return upcoming[0]?.due_date ?? null;
}

// 1인 법인이라 "결재 대기 몇 건" 같은 숫자보다, 지금 부서별로 어떤 프로젝트가 어디까지
// 진행됐는지가 실제로 매일 들여다볼 정보라서 그걸 홈 화면 맨 앞에 둔다.
export async function renderDashboard(container) {
  const [departments, { data: activeProjects }, { count: pendingCount }, { count: regCount }, { data: recentRegs }] = await Promise.all([
    fetchDepartments({ activeOnly: true }),
    supabase.from('projects').select('*, project_tasks(status, due_date)').eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('regulations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('regulations').select('reg_id,title,category,effective_date').eq('status', 'active').order('updated_at', { ascending: false }).limit(5),
  ]);

  const projects = activeProjects ?? [];
  const deptSections = departments
    .map((d) => {
      const deptProjects = projects.filter((p) => p.dept_id === d.dept_id);
      const rows = deptProjects
        .map((p) => {
          const tasks = p.project_tasks ?? [];
          const pct = progressOf(tasks);
          const due = nearestDue(tasks);
          return `<tr>
            <td>${esc(p.title)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--brand)"></div></div>
                <span class="note" style="width:36px;text-align:right">${pct}%</span>
              </div>
            </td>
            <td class="c">${due ? `~${dateStr(due)}` : ''}</td>
          </tr>`;
        })
        .join('');

      return `<div style="margin-bottom:18px">
        <h3>${esc(d.dept_name)} <span class="note">(진행중 ${deptProjects.length}건)</span></h3>
        ${deptProjects.length ? `<div style="overflow-x:auto"><table><tr><th>프로젝트</th><th>진행률</th><th>다음 마감</th></tr>${rows}</table></div>` : '<p class="note">진행 중인 프로젝트가 없습니다.</p>'}
      </div>`;
    })
    .join('');

  const regRows = (recentRegs ?? [])
    .map(
      (r) => `<tr>
        <td class="c">${esc(r.category)}</td>
        <td>${esc(r.title)}</td>
        <td class="c">${dateStr(r.effective_date)}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>부서별 프로젝트 진행 현황</h2>
    ${deptSections || '<p class="note">등록된 부서가 없습니다.</p>'}
  </div>

  <div class="grid">
    <div class="kpi"><div class="t">결재 대기 문서</div><div class="v">${pendingCount ?? 0}</div></div>
    <div class="kpi"><div class="t">시행중 규정</div><div class="v">${regCount ?? 0}</div></div>
  </div>

  <div class="card">
    <h2>최근 제규정</h2>
    ${regRows ? `<div style="overflow-x:auto"><table><tr><th>구분</th><th>제목</th><th>시행일</th></tr>${regRows}</table></div>` : '<p class="note">등록된 규정이 없습니다.</p>'}
  </div>`;
}
