import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr } from '../../lib/util.js';
import { SCHEDULE_CATEGORIES } from '../lib/scheduleCategories.js';

let mode = 'list'; // 'list' | 'new' | 'edit'
let currentScheduleId = null;
let categoryFilter = 'all';
let statusFilter = 'upcoming'; // 'upcoming' | 'done' | 'all'
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentScheduleId = null;
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

export async function renderSchedules(container) {
  if (mode === 'list') return renderList(container);
  return renderForm(container);
}

async function renderList(container) {
  const { data: allSchedules, error } = await supabase.from('schedules').select('*').order('due_date');
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">일정 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allSchedules.map((s) => yearOf(s.due_date)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());

  const schedules = allSchedules.filter(
    (s) =>
      (categoryFilter === 'all' || s.category === categoryFilter) &&
      (statusFilter === 'all' || (statusFilter === 'done' ? s.done : !s.done)) &&
      (yearFilter === 'all' || yearOf(s.due_date) === Number(yearFilter))
  );

  const tabs = [['all', '전체'], ...SCHEDULE_CATEGORIES.map((c) => [c, c])]
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

  const rows = schedules
    .map(
      (s) => `<tr class="${s.done ? 'inactive' : ''}">
        <td class="c"><input type="checkbox" data-done="${s.schedule_id}" ${s.done ? 'checked' : ''}></td>
        <td class="c">${esc(s.category)}</td>
        <td><a href="#" data-open="${s.schedule_id}">${esc(s.title)}</a></td>
        <td class="c">${s.due_date}</td>
        <td class="c"><span class="badge ${ddayClass(s.due_date, s.done)}">${s.done ? '완료' : ddayLabel(s.due_date)}</span></td>
        <td class="c"><button class="btn sm ghost" data-del="${s.schedule_id}">삭제</button></td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${tabs}
      <select id="statusSel" style="margin-left:8px">${statusOptions}</select>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn" id="newScheduleBtn" style="margin-left:auto">일정 등록</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th></th><th>분류</th><th>제목</th><th>기한</th><th>D-day</th><th></th></tr>
      ${rows || '<tr><td colspan="6" class="note" style="text-align:center">등록된 일정이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { categoryFilter = b.dataset.filter; renderSchedules(container); };
  });
  document.getElementById('statusSel').onchange = (ev) => { statusFilter = ev.target.value; renderSchedules(container); };
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderSchedules(container); };
  document.getElementById('newScheduleBtn').onclick = () => { currentScheduleId = null; mode = 'new'; renderSchedules(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentScheduleId = Number(a.dataset.open); mode = 'edit'; renderSchedules(container); };
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
