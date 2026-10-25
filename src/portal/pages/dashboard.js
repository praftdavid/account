import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr } from '../../lib/util.js';
import { fetchDepartments } from '../lib/departments.js';
import { daysUntil, ddayLabel, ddayClass, fetchProjectDeadlines, openNewSchedule } from './schedules.js';
import { openProject } from './projects.js';
import { openDocument, openNewDocument } from './documents.js';
import { openTrade, openNewTrade } from './tradeLog.js';
import { navigate } from '../nav.js';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function dateStr(ts) {
  return ts ? String(ts).slice(0, 10) : '';
}

function todayLabel() {
  const d = new Date(todayStr());
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${WEEKDAY[d.getDay()]}요일`;
}

// 프로젝트의 "다음 업무": 끝나지 않은 업무 중 기한이 가장 가까운 것(기한 없는 업무는 뒤로).
function nextTask(tasks) {
  const open = tasks.filter((t) => t.status !== '완료');
  return open.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0] ?? null;
}

// 홈은 숫자 통계보다 "지금 무엇부터 해야 하는지"를 먼저 보여준다. 진행률 막대 대신 기한(D-day)으로 긴급도를 읽는다.
export async function renderDashboard(container) {
  const [departments, { data: activeProjects }, { data: openDocs }, { data: reviewTrades }, { data: recentRegs }, { data: rawSchedules }, projectDeadlines] = await Promise.all([
    fetchDepartments({ activeOnly: true }),
    supabase.from('projects').select('*, project_tasks(title, status, due_date)').eq('status', 'active'),
    supabase.from('documents').select('doc_id,title,doc_no,status,created_at,submitted_at').in('status', ['submitted', 'draft']).order('created_at', { ascending: false }).limit(5),
    supabase.from('trade_logs').select('trade_id,trade_date,stock_name,side').is('review', null).order('trade_date', { ascending: false }).limit(5),
    supabase.from('regulations').select('reg_id,title,category,effective_date').eq('status', 'active').order('updated_at', { ascending: false }).limit(4),
    supabase.from('schedules').select('*').eq('done', false).order('due_date'),
    fetchProjectDeadlines().catch((err) => {
      console.error(err);
      return [];
    }),
  ]);

  const upcoming = [...(rawSchedules ?? []).map((s) => ({ ...s, source: 'manual' })), ...projectDeadlines].sort((a, b) => a.due_date.localeCompare(b.due_date));

  // 지금 처리할 일: 7일 안으로 다가왔거나 지난 일정 → 결재 대기·상신 전 문서 → 복기 안 쓴 매매 순서.
  const todo = [];
  upcoming
    .filter((s) => daysUntil(s.due_date) <= 7)
    .forEach((s) =>
      todo.push({
        tag: '일정',
        tagClass: ddayClass(s.due_date, false),
        title: s.title,
        meta: `${s.category} · ${s.due_date}`,
        badge: ddayLabel(s.due_date),
        badgeClass: ddayClass(s.due_date, false),
        open: () => (s.source === 'project' ? (openProject(s.project_id), navigate('projects')) : navigate('schedules')),
      })
    );
  (openDocs ?? []).forEach((d) =>
    todo.push({
      tag: '결재',
      tagClass: 'draft',
      title: d.title,
      meta: d.status === 'submitted' ? `승인 대기 · ${d.doc_no ?? ''} · ${dateStr(d.submitted_at)} 상신` : `상신 전 · ${dateStr(d.created_at)} 기안`,
      open: () => (openDocument(d.doc_id), navigate('docs')),
    })
  );
  (reviewTrades ?? []).forEach((t) =>
    todo.push({
      tag: '복기',
      tagClass: 'ok',
      title: `${t.stock_name} ${t.side === 'buy' ? '매수' : '매도'} 복기 작성`,
      meta: `${t.trade_date} 기록 · 투자 판단 돌아보기`,
      open: () => (openTrade(t.trade_id), navigate('tradesTodo')),
    })
  );

  const todoRows = todo
    .slice(0, 8)
    .map(
      (t, i) => `<button class="home-row" data-todo="${i}">
        <span class="badge ${t.tagClass}">${t.tag}</span>
        <span class="home-row-main"><b>${esc(t.title)}</b><span class="note">${esc(t.meta)}</span></span>
        ${t.badge ? `<span class="badge ${t.badgeClass}">${esc(t.badge)}</span>` : '<span class="home-arrow">›</span>'}
      </button>`
    )
    .join('');

  const deptName = (id) => departments.find((d) => d.dept_id === id)?.dept_name ?? '';
  const projects = (activeProjects ?? [])
    .map((p) => {
      const next = nextTask(p.project_tasks ?? []);
      const due = next?.due_date ?? p.end_date ?? null;
      return { p, next, due };
    })
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));

  const projectCards = projects
    .map(
      ({ p, next, due }) => `<button class="home-row" data-project="${p.project_id}">
        <span class="home-row-main"><b>${esc(p.title)}</b>
          <span class="note">${esc(deptName(p.dept_id))}${next ? ` · 다음 업무: ${esc(next.title)}` : ''}${due ? ` · ~${dateStr(due)}` : ''}</span></span>
        ${due ? `<span class="badge ${ddayClass(due, false)}">${ddayLabel(due)}</span>` : '<span class="note">기한 없음</span>'}
      </button>`
    )
    .join('');

  const scheduleRows = upcoming
    .slice(0, 5)
    .map(
      (s) => `<div class="home-line"><span class="note">${esc(s.category)}</span><span class="home-row-main"><b>${esc(s.title)}</b><span class="note">${s.due_date}</span></span><span class="badge ${ddayClass(s.due_date, false)}">${ddayLabel(s.due_date)}</span></div>`
    )
    .join('');

  const regRows = (recentRegs ?? [])
    .map((r) => `<div class="home-line"><span class="note">${esc(r.category)}</span><span class="home-row-main"><b>${esc(r.title)}</b><span class="note">시행 ${dateStr(r.effective_date)}</span></span></div>`)
    .join('');

  container.innerHTML = `
  <div class="home">
    <div class="home-hello">
      <div class="note">${todayLabel()}</div>
      <h2>오늘의 업무를 한눈에</h2>
      <div class="note">놓치지 말아야 할 일부터 차근차근 처리하세요.</div>
    </div>

    <div class="home-quick">
      <button class="btn ghost" id="quickDoc">문서 작성</button>
      <button class="btn ghost" id="quickTrade">매매 기록</button>
      <button class="btn ghost" id="quickSched">일정 등록</button>
    </div>

    <div class="card">
      <h2>지금 처리할 일 <span class="home-count">${todo.length}</span></h2>
      ${todoRows || '<p class="note">지금 처리할 일이 없습니다.</p>'}
    </div>

    <div class="card">
      <h2>진행 중 프로젝트</h2>
      ${projectCards || '<p class="note">진행 중인 프로젝트가 없습니다.</p>'}
    </div>

    <div class="card">
      <div class="toolbar"><h2 style="margin-bottom:0">다가오는 일정</h2><button class="btn ghost sm" id="allSched" style="margin-left:auto">전체 보기</button></div>
      ${scheduleRows || '<p class="note">등록된 일정이 없습니다. [일정 등록]으로 추가하세요.</p>'}
    </div>

    <div class="card">
      <div class="toolbar"><h2 style="margin-bottom:0">최근 규정</h2><button class="btn ghost sm" id="allRegs" style="margin-left:auto">전체 보기</button></div>
      ${regRows || '<p class="note">등록된 규정이 없습니다.</p>'}
    </div>

    <a class="home-switch" href="/portal.html">관리회계 시스템으로 이동 →</a>
  </div>`;

  container.querySelectorAll('[data-todo]').forEach((b) => (b.onclick = () => todo[Number(b.dataset.todo)].open()));
  container.querySelectorAll('[data-project]').forEach((b) => (b.onclick = () => { openProject(Number(b.dataset.project)); navigate('projects'); }));
  document.getElementById('quickDoc').onclick = () => { openNewDocument(); navigate('docs'); };
  document.getElementById('quickTrade').onclick = () => { openNewTrade(); navigate('trades'); };
  document.getElementById('quickSched').onclick = () => { openNewSchedule(); navigate('schedules'); };
  document.getElementById('allSched').onclick = () => navigate('schedules');
  document.getElementById('allRegs').onclick = () => navigate('regs');
}
