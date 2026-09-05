import { supabase } from '../lib/supabaseClient.js';
import { renderLogin } from '../pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderDocuments, resetView as resetDocuments } from './pages/documents.js';
import { renderRegulations, resetView as resetRegulations } from './pages/regulations.js';
import { renderProjects, resetView as resetProjects } from './pages/projects.js';
import { renderProjectArchive, resetView as resetProjectArchive } from './pages/projectArchive.js';
import { renderDepartments } from './pages/departments.js';
import { esc } from '../lib/util.js';

// 새 글 작성/수정 화면을 보다가 다른 탭으로 갔다 와도 항상 목록부터 보이도록, 실제 네비게이션
// (nav 클릭)으로 들어올 때만 해당 화면을 목록 모드로 되돌린다 — 저장 후 상세로 넘어가는 등
// 페이지 내부 전환은 이 리셋을 거치지 않고 각자 알아서 처리한다.
const VIEW_RESET = { docs: resetDocuments, regs: resetRegulations, projects: resetProjects, archive: resetProjectArchive };

// 메뉴 배치 원칙 — 실제로 자주 쓰는 순서대로: 대시보드 → 전자결재 → 프로젝트(진행중 업무관리) →
// 제규정 → 부서자료(완료 프로젝트 아카이브, 조회 위주) → 기초정보(마스터데이터, 맨 뒤).
const GROUPS = [
  ['home', '대시보드', [['dashboard', '대시보드', renderDashboard]]],
  ['reg', '제규정', [['regs', '규정목록', renderRegulations]]],
  ['approval', '전자결재', [['docs', '문서함', renderDocuments]]],
  ['project', '프로젝트', [['projects', '진행 현황', renderProjects]]],
  ['dept', '부서자료', [['archive', '완료 프로젝트', renderProjectArchive]]],
  ['base', '기초정보', [['depts', '부서관리', renderDepartments]]],
];

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const userbarEl = document.getElementById('userbar');
const homeLinkEl = document.getElementById('homeLink');
if (homeLinkEl) homeLinkEl.onclick = () => go('dashboard');

let session = null;
let cur = 'dashboard';

function groupOf(view) {
  return GROUPS.find((g) => g[2].some((v) => v[0] === view));
}

function go(view) {
  VIEW_RESET[view]?.();
  cur = view;
  render();
}

async function render() {
  if (!session) {
    navEl.innerHTML = '';
    userbarEl.innerHTML = '';
    renderLogin(mainEl);
    return;
  }

  userbarEl.innerHTML = `<span>${esc(session.user.email)}</span><button class="btn ghost sm" id="logoutBtn">로그아웃</button>`;
  document.getElementById('logoutBtn').onclick = () => supabase.auth.signOut();

  const curGroup = groupOf(cur) ?? GROUPS[0];

  navEl.innerHTML = `
    <div class="nav-row nav-groups">${GROUPS.map(([k, label]) => `<button class="${k === curGroup[0] ? 'on' : ''}" data-group="${k}">${label}</button>`).join('')}</div>
    ${curGroup[2].length > 1 ? `<div class="nav-row nav-items">${curGroup[2].map(([k, label]) => `<button class="${k === cur ? 'on' : ''}" data-view="${k}">${label}</button>`).join('')}</div>` : ''}`;

  navEl.querySelectorAll('[data-group]').forEach((b) => {
    b.onclick = () => {
      const g = GROUPS.find((gr) => gr[0] === b.dataset.group);
      go(g[2][0][0]);
    };
  });
  navEl.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => go(b.dataset.view)));

  const view = curGroup[2].find((v) => v[0] === cur);
  mainEl.innerHTML = '<p class="note">불러오는 중…</p>';
  try {
    await view[2](mainEl);
  } catch (err) {
    mainEl.innerHTML = `<div class="card"><p class="err">오류: ${esc(err.message ?? String(err))}</p></div>`;
  }
}

supabase.auth.getSession().then(({ data }) => {
  session = data.session;
  render();
});

supabase.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  if (!session) cur = 'dashboard';
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
