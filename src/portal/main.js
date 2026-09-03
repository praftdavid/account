import { supabase } from '../lib/supabaseClient.js';
import { renderLogin } from '../pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderDocuments } from './pages/documents.js';
import { renderRegulations } from './pages/regulations.js';
import { renderDeptPosts } from './pages/deptPosts.js';
import { renderDepartments } from './pages/departments.js';
import { esc } from '../lib/util.js';

// 메뉴 배치 원칙 — 실제로 자주 쓰는 순서대로: 대시보드 → 전자결재(가장 빈번한 일상 업무) →
// 제규정(가끔 참조) → 부서자료(가끔 참조) → 기초정보(거의 안 건드리는 마스터데이터, 맨 뒤).
// 회계 시스템(src/main.js)과 같은 원칙(#4 그룹 성격에 따른 정렬)을 그대로 따른다.
const GROUPS = [
  ['home', '대시보드', [['dashboard', '대시보드', renderDashboard]]],
  ['approval', '전자결재', [['docs', '문서함', renderDocuments]]],
  ['reg', '제규정', [['regs', '규정목록', renderRegulations]]],
  ['dept', '부서자료', [['posts', '게시판', renderDeptPosts]]],
  ['base', '기초정보', [['depts', '부서관리', renderDepartments]]],
];

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const userbarEl = document.getElementById('userbar');

let session = null;
let cur = 'dashboard';

function groupOf(view) {
  return GROUPS.find((g) => g[2].some((v) => v[0] === view));
}

function go(view) {
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
