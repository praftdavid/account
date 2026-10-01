import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr } from '../../lib/util.js';
import { SCHEDULE_CATEGORIES, DISPLAY_CATEGORIES } from '../lib/scheduleCategories.js';
import { openProject } from './projects.js';
import { navigate } from '../nav.js';

let mode = 'list'; // 'list' | 'new' | 'edit'
let currentScheduleId = null;
let categoryFilter = 'all';
let statusFilter = 'upcoming'; // 'upcoming' | 'done' | 'all'
let yearFilter = 'all';
const todayDate = new Date(todayStr());
let calendarYear = todayDate.getFullYear();
let calendarMonth = todayDate.getMonth() + 1; // 1~12
let selectedDay = null; // 'YYYY-MM-DD' | null

export function resetView() {
  mode = 'list';
  currentScheduleId = null;
  calendarYear = todayDate.getFullYear();
  calendarMonth = todayDate.getMonth() + 1;
  selectedDay = null;
}

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

// 법인세·부가세 신고기일처럼 놓치면 안 되는 날짜를 "오늘로부터 며칠 남았는지"로 바로 체감하게
// 보여준다 — 달력 날짜만 봐서는 얼마나 급한지 한눈에 안 들어오기 때문.
export function daysUntil(dueDate) {
  const today = new Date(todayStr());
  const due = new Date(dueDate);
  return Math.round((due - today) / 86400000);
}

export function ddayLabel(dueDate) {
  const d = daysUntil(dueDate);
  if (d === 0) return 'D-day';
  if (d > 0) return `D-${d}`;
  return `D+${-d} 지남`;
}

export function ddayClass(dueDate, done) {
  if (done) return '';
  const d = daysUntil(dueDate);
  if (d < 0) return 'bad';
  if (d <= 7) return 'draft';
  return 'ok';
}

// 프로젝트는 자체 메뉴(마감일·진행률·담당자)가 따로 있어 여기서 또 등록받지 않고, 종료
// 예정일이 있는 진행중 프로젝트를 그대로 끌어와 다른 일정과 같은 목록에 섞어 보여준다.
// 클릭하면 이 화면 안에 복제해 보여주는 대신 실제 프로젝트 탭의 그 프로젝트 상세로 보낸다.
export async function fetchProjectDeadlines() {
  const { data, error } = await supabase.from('projects').select('project_id, title, end_date').eq('status', 'active').not('end_date', 'is', null);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    source: 'project',
    project_id: p.project_id,
    category: '프로젝트',
    title: p.title,
    due_date: p.end_date,
    done: false,
  }));
}

export async function renderSchedules(container) {
  if (mode === 'list') return renderList(container);
  return renderForm(container);
}

async function renderList(container) {
  const [{ data: rawSchedules, error }, projectDeadlines] = await Promise.all([
    supabase.from('schedules').select('*').order('due_date'),
    fetchProjectDeadlines().catch((err) => {
      console.error(err);
      return [];
    }),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">일정 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const allSchedules = [...(rawSchedules ?? []).map((s) => ({ ...s, source: 'manual' })), ...projectDeadlines].sort((a, b) =>
    a.due_date.localeCompare(b.due_date)
  );

  const years = [...new Set(allSchedules.map((s) => yearOf(s.due_date)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());

  const isCalendar = categoryFilter === 'all';

  const schedules = allSchedules.filter(
    (s) =>
      (categoryFilter === 'all' || s.category === categoryFilter) &&
      (statusFilter === 'all' || (statusFilter === 'done' ? s.done : !s.done)) &&
      (isCalendar || yearFilter === 'all' || yearOf(s.due_date) === Number(yearFilter))
  );

  const tabs = [['all', '전체'], ...DISPLAY_CATEGORIES.map((c) => [c, c])]
    .map(([k, label]) => `<button class="btn sm ${k === categoryFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');
  const statusOptions = [
    ['upcoming', '예정만'],
    ['done', '완료만'],
    ['all', '전체'],
  ]
    .map(([k, label]) => `<option value="${k}" ${k === statusFilter ? 'selected' : ''}>${label}</option>`)
    .join('');
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${tabs}
      <select id="statusSel" style="margin-left:8px">${statusOptions}</select>
      ${isCalendar ? '' : `<select id="yearSel" style="margin-left:8px">${yearOptions}</select>`}
      <button class="btn" id="newScheduleBtn" style="margin-left:auto">일정 등록</button>
    </div>
    ${isCalendar ? renderCalendarHtml(schedules) : renderTableHtml(schedules)}
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { categoryFilter = b.dataset.filter; selectedDay = null; renderSchedules(container); };
  });
  document.getElementById('statusSel').onchange = (ev) => { statusFilter = ev.target.value; renderSchedules(container); };
  document.getElementById('yearSel')?.addEventListener('change', (ev) => { yearFilter = ev.target.value; renderSchedules(container); });
  document.getElementById('newScheduleBtn').onclick = () => { currentScheduleId = null; mode = 'new'; renderSchedules(container); };

  if (isCalendar) wireCalendar(container, schedules);
  else wireTable(container);
}

function renderTableHtml(schedules) {
  const rows = schedules
    .map((s) =>
      s.source === 'project'
        ? `<tr>
        <td></td>
        <td class="c">${esc(s.category)}</td>
        <td><a href="#" data-open-project="${s.project_id}">${esc(s.title)}</a></td>
        <td class="c">${s.due_date}</td>
        <td class="c"><span class="badge ${ddayClass(s.due_date, false)}">${ddayLabel(s.due_date)}</span></td>
        <td></td>
      </tr>`
        : `<tr class="${s.done ? 'inactive' : ''}">
        <td class="c"><input type="checkbox" data-done="${s.schedule_id}" ${s.done ? 'checked' : ''}></td>
        <td class="c">${esc(s.category)}</td>
        <td><a href="#" data-open="${s.schedule_id}">${esc(s.title)}</a></td>
        <td class="c">${s.due_date}</td>
        <td class="c"><span class="badge ${ddayClass(s.due_date, s.done)}">${s.done ? '완료' : ddayLabel(s.due_date)}</span></td>
        <td class="c"><button class="btn sm ghost" data-del="${s.schedule_id}">삭제</button></td>
      </tr>`
    )
    .join('');

  return `<div style="overflow-x:auto"><table>
      <tr><th></th><th>분류</th><th>제목</th><th>기한</th><th>D-day</th><th></th></tr>
      ${rows || '<tr><td colspan="6" class="note" style="text-align:center">등록된 일정이 없습니다.</td></tr>'}
    </table></div>`;
}

function wireTable(container) {
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentScheduleId = Number(a.dataset.open); mode = 'edit'; renderSchedules(container); };
  });
  container.querySelectorAll('[data-open-project]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); openProject(Number(a.dataset.openProject)); navigate('projects'); };
  });
  container.querySelectorAll('[data-done]').forEach((cb) => {
    cb.onchange = async () => {
      const { error: doneErr } = await supabase.from('schedules').update({ done: cb.checked, updated_at: new Date().toISOString() }).eq('schedule_id', Number(cb.dataset.done));
      if (doneErr) { alert('처리 실패: ' + doneErr.message); return; }
      renderSchedules(container);
    };
  });
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 일정을 삭제할까요?')) return;
      const { error: delErr } = await supabase.from('schedules').delete().eq('schedule_id', Number(b.dataset.del));
      if (delErr) { alert('삭제 실패: ' + delErr.message); return; }
      renderSchedules(container);
    };
  });
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 달력 칸 안에는 제목을 직접 넣지 않는다 — 긴 한글 제목이 좁은 칸에서 단어 중간에 끊기며
// 줄바꿈되는 걸 싫어하므로, 칸에는 건수만 보여주고 날짜를 클릭하면 아래 패널에 전체 목록을 띄운다.
function renderCalendarHtml(schedules) {
  const itemsByDate = {};
  for (const s of schedules) {
    (itemsByDate[s.due_date] ??= []).push(s);
  }

  const totalDays = new Date(calendarYear, calendarMonth, 0).getDate();
  const firstWeekday = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const todayStrValue = todayStr();

  const headCells = WEEKDAY_LABELS.map(
    (w, i) => `<div class="cal-head" style="${i === 0 ? 'color:var(--red)' : i === 6 ? 'color:var(--blue)' : ''}">${w}</div>`
  ).join('');

  const leadingBlanks = Array.from({ length: firstWeekday }, () => '<div class="cal-day empty"></div>').join('');
  const dayCells = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const dateStr = toDateStr(calendarYear, calendarMonth, day);
    const items = itemsByDate[dateStr] ?? [];
    const isToday = dateStr === todayStrValue;
    const isSelected = dateStr === selectedDay;
    return `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-day="${dateStr}">
      <span class="cal-daynum">${day}</span>
      ${items.length ? `<span class="badge draft cal-count">${items.length}</span>` : ''}
    </div>`;
  }).join('');
  const totalCells = firstWeekday + totalDays;
  const trailingBlanks = Array.from({ length: (7 - (totalCells % 7)) % 7 }, () => '<div class="cal-day empty"></div>').join('');

  const selectedItems = selectedDay ? itemsByDate[selectedDay] ?? [] : [];
  const selectedRows = selectedItems
    .map(
      (s) => `<div class="cal-agenda-row">
        <span class="badge ${ddayClass(s.due_date, s.done)}">${esc(s.category)}</span>
        ${s.source === 'project' ? `<a href="#" data-open-project="${s.project_id}">${esc(s.title)}</a>` : `<a href="#" data-open="${s.schedule_id}">${esc(s.title)}</a>`}
        <span class="note" style="margin-left:auto">${s.done ? '완료' : ddayLabel(s.due_date)}</span>
      </div>`
    )
    .join('');

  return `
    <div class="toolbar" style="justify-content:center;gap:18px;margin:10px 0">
      <button class="btn sm ghost" id="calPrev">‹</button>
      <h3 style="margin:0;min-width:110px;text-align:center">${calendarYear}년 ${calendarMonth}월</h3>
      <button class="btn sm ghost" id="calNext">›</button>
    </div>
    <div class="cal-grid" id="calGrid">${headCells}${leadingBlanks}${dayCells}${trailingBlanks}</div>
    ${
      selectedDay
        ? `<div class="card" style="margin:14px 0 0;box-shadow:none;border:1px solid var(--bd)">
            <div class="toolbar"><h3 style="margin:0">${selectedDay}</h3><button class="btn sm ghost" id="calCloseDay" style="margin-left:auto">닫기</button></div>
            ${selectedRows || '<p class="note">이 날짜에 등록된 일정이 없습니다.</p>'}
          </div>`
        : ''
    }`;
}

function wireCalendar(container, schedules) {
  const shiftMonth = (delta) => {
    let m = calendarMonth + delta;
    let y = calendarYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    calendarMonth = m;
    calendarYear = y;
    selectedDay = null;
    renderSchedules(container);
  };

  document.getElementById('calPrev').onclick = () => shiftMonth(-1);
  document.getElementById('calNext').onclick = () => shiftMonth(1);
  document.getElementById('calCloseDay')?.addEventListener('click', () => { selectedDay = null; renderSchedules(container); });

  container.querySelectorAll('.cal-day[data-day]').forEach((cell) => {
    cell.onclick = () => {
      selectedDay = selectedDay === cell.dataset.day ? null : cell.dataset.day;
      renderSchedules(container);
    };
  });

  // 화살표뿐 아니라 좌우 스와이프로도 전월/다음월 이동 — 모바일에서 달력은 손가락으로
  // 넘기는 게 자연스럽다.
  const grid = document.getElementById('calGrid');
  let touchStartX = null;
  grid.addEventListener('touchstart', (ev) => { touchStartX = ev.touches[0].clientX; }, { passive: true });
  grid.addEventListener('touchend', (ev) => {
    if (touchStartX === null) return;
    const dx = ev.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 40) return;
    shiftMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentScheduleId = Number(a.dataset.open); mode = 'edit'; renderSchedules(container); };
  });
  container.querySelectorAll('[data-open-project]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); openProject(Number(a.dataset.openProject)); navigate('projects'); };
  });
}

async function renderForm(container) {
  let schedule = null;
  if (mode === 'edit' && currentScheduleId) {
    const { data, error } = await supabase.from('schedules').select('*').eq('schedule_id', currentScheduleId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">일정 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    schedule = data;
  }

  const categoryOptions = SCHEDULE_CATEGORIES.map((c) => `<option value="${c}" ${(schedule?.category ?? SCHEDULE_CATEGORIES[0]) === c ? 'selected' : ''}>${c}</option>`).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${schedule ? '일정 수정' : '일정 등록'}</h2>
    <form class="entry" id="scheduleForm">
      <div style="grid-column:span 3"><label>분류 *</label><select id="f_cat">${categoryOptions}</select></div>
      <div style="grid-column:span 3"><label>기한 *</label><input id="f_due" type="date" required value="${schedule?.due_date ?? todayStr()}"></div>
      <div style="grid-column:span 6"><label>제목 *</label><input id="f_title" type="text" required placeholder="예: 2025 사업연도 법인세 신고·납부" value="${esc(schedule?.title ?? '')}"></div>
      <div style="grid-column:span 12"><label>메모</label><textarea id="f_memo" rows="6" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical;line-height:1.6">${esc(schedule?.memo ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="scheduleErr"></span>
      </div>
    </form>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => { resetView(); renderSchedules(container); };

  document.getElementById('scheduleForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('scheduleErr');
    errEl.textContent = '';

    const payload = {
      category: document.getElementById('f_cat').value,
      title: document.getElementById('f_title').value.trim(),
      due_date: document.getElementById('f_due').value,
      memo: document.getElementById('f_memo').value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (schedule) {
      const { error } = await supabase.from('schedules').update(payload).eq('schedule_id', schedule.schedule_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
    } else {
      const email = await currentUserEmail();
      const { error } = await supabase.from('schedules').insert({ ...payload, created_by: email });
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
    }

    resetView();
    renderSchedules(container);
  });
}
