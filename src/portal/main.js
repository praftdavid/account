import { supabase } from '../lib/supabaseClient.js';
import { renderLogin } from '../pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderSchedules, resetView as resetSchedules } from './pages/schedules.js';
import { renderTradeLog, resetView as resetTradeLog } from './pages/tradeLog.js';
import { renderAllDocuments } from './pages/documentsAll.js';
import { renderDocuments, resetView as resetDocuments } from './pages/documents.js';
import { renderRegulations, resetView as resetRegulations } from './pages/regulations.js';
import { renderProjects, resetView as resetProjects } from './pages/projects.js';
import { renderProjectArchive, resetView as resetProjectArchive } from './pages/projectArchive.js';
import { renderDepartments } from './pages/departments.js';
import { renderDocTemplates, resetView as resetDocTemplates } from './pages/docTemplatesPage.js';
import { renderSeals, renderSealLog } from './pages/seals.js';
import { esc } from '../lib/util.js';
import { renderAccountMenu } from '../lib/accountMenu.js';
import { setRenderer, getCurrentView, setCurrentView } from './nav.js';

// 새 글 작성/수정 화면을 보다가 다른 탭으로 갔다 와도 항상 목록부터 보이도록, 실제 네비게이션
// (nav 클릭)으로 들어올 때만 해당 화면을 목록 모드로 되돌린다 — 저장 후 상세로 넘어가는 등
// 페이지 내부 전환은 이 리셋을 거치지 않고 각자 알아서 처리한다.
const VIEW_RESET = { schedules: resetSchedules, trades: resetTradeLog, tradesTodo: resetTradeLog, tradesDone: resetTradeLog, docs: resetDocuments, regs: resetRegulations, projects: resetProjects, archive: resetProjectArchive, templates: resetDocTemplates };

// 메뉴는 큰 메뉴 4개로 줄이고(설정은 계정 메뉴 안), 비슷한 화면은 둘째 줄의 탭으로 묶는다(모바일에서 한 줄에 다 보이게).
//  · 홈: 지금 처리할 일·일정 요약
//  · 업무·일정: 진행 중 프로젝트 / 완료 프로젝트(예전 부서자료) / 일정(달력)
//  · 매매일지
//  · 문서: 기안·결재(전자결재) / 규정·정관(제규정)
//  · 설정: 부서·서식·직인·날인기록부(예전 기초정보)
const GROUPS = [
  ['home', '홈', [['dashboard', '홈', renderDashboard]]],
  [
    'work',
    '업무·일정',
    [
      ['projects', '진행 중', renderProjects],
      ['archive', '완료', renderProjectArchive],
      ['schedules', '일정', renderSchedules],
    ],
  ],
  [
    'trade',
    '매매일지',
    [
      ['trades', '전체', (c) => renderTradeLog(c, 'all')],
      ['tradesTodo', '복기 필요', (c) => renderTradeLog(c, 'todo')],
      ['tradesDone', '복기 완료', (c) => renderTradeLog(c, 'done')],
    ],
  ],
  [
    'docs',
    '문서',
    [
      ['allDocs', '전체', renderAllDocuments],
      ['docs', '기안·결재', renderDocuments],
      ['regs', '규정·정관', renderRegulations],
    ],
  ],
  [
    'settings',
    '설정',
    [
      ['depts', '부서관리', renderDepartments],
      ['templates', '서식관리', renderDocTemplates],
      ['seals', '직인관리', renderSeals],
      ['sealLog', '날인기록부', renderSealLog],
    ],
  ],
];

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const userbarEl = document.getElementById('userbar');
const homeLinkEl = document.getElementById('homeLink');
if (homeLinkEl) homeLinkEl.onclick = () => go('dashboard');

let session = null;

function groupOf(view) {
  return GROUPS.find((g) => g[2].some((v) => v[0] === view));
}

function go(view) {
  VIEW_RESET[view]?.();
  setCurrentView(view);
  render();
}

async function render() {
  if (!session) {
    navEl.innerHTML = '';
    userbarEl.innerHTML = '';
    renderLogin(mainEl);
    return;
  }

  // 계정 메뉴: 이메일·설정(부서/서식/직인/날인기록부)·관리회계 포털 이동·로그아웃을 한곳에 모아 상단을 단순하게 한다.
  const settingsItems = GROUPS.find((g) => g[0] === 'settings')[2];
  renderAccountMenu(userbarEl, session.user.email, [
    { heading: '설정' },
    ...settingsItems.map(([k, label]) => ({ label, run: () => go(k) })),
    { divider: true },
    { label: '관리회계 포털 →', href: '/portal.html' },
    { label: '로그아웃', run: () => supabase.auth.signOut() },
  ]);

  const cur = getCurrentView();
  const curGroup = groupOf(cur) ?? GROUPS[0];

  navEl.innerHTML = `
    <div class="nav-row nav-groups compact">${GROUPS.filter(([k]) => k !== 'settings').map(([k, label]) => `<button class="${k === curGroup[0] ? 'on' : ''}" data-group="${k}">${label}</button>`).join('')}</div>
    ${curGroup[2].length > 1 ? `<div class="nav-row nav-items compact">${curGroup[2].map(([k, label]) => `<button class="${k === cur ? 'on' : ''}" data-view="${k}">${label}</button>`).join('')}</div>` : ''}`;

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

setRenderer(render);

supabase.auth.getSession().then(({ data }) => {
  session = data.session;
  render();
});

supabase.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  if (!session) setCurrentView('dashboard');
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
