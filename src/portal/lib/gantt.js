import { esc } from '../../lib/util.js';

const STATUS_COLOR = { 시작전: 'var(--text-mute)', 진행중: 'var(--brand)', 완료: 'var(--green)' };

function toDate(s) {
  return s ? new Date(s + 'T00:00:00') : null;
}
function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// 드래그 조정 같은 건 없는, 날짜만 입력하면 자동으로 그려지는 읽기전용 간트.
// 라이브러리 없이 트랙 너비 대비 %로 막대 위치·길이를 계산해서 그린다.
export function renderGanttChart(tasks) {
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  if (dated.length === 0) return '<p class="note">시작일/기한이 입력된 업무가 없어 간트차트를 표시할 수 없습니다.</p>';

  const starts = dated.map((t) => toDate(t.start_date ?? t.due_date));
  const ends = dated.map((t) => toDate(t.due_date ?? t.start_date));
  let rangeStart = new Date(Math.min(...starts));
  let rangeEnd = new Date(Math.max(...ends));
  if (rangeStart.getTime() === rangeEnd.getTime()) rangeEnd = new Date(rangeStart.getTime() + 86400000);
  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd)) + 1;

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const todayPct = today >= rangeStart && today <= rangeEnd ? (daysBetween(rangeStart, today) / totalDays) * 100 : null;

  const rows = dated
    .map((t) => {
      const s = toDate(t.start_date ?? t.due_date);
      const e = toDate(t.due_date ?? t.start_date);
      const leftPct = (daysBetween(rangeStart, s) / totalDays) * 100;
      const widthPct = Math.max((daysBetween(s, e) + 1) / totalDays * 100, 1.5);
      const color = STATUS_COLOR[t.status] ?? STATUS_COLOR['시작전'];
      return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="width:150px;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)}">${esc(t.title)}</div>
        <div style="flex:1;position:relative;height:18px;background:var(--bg);border-radius:4px">
          <div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${color};border-radius:4px"></div>
        </div>
      </div>`;
    })
    .join('');

  return `
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-mute);margin:0 0 6px 160px">
    <span>${rangeStart.toISOString().slice(0, 10)}</span>
    <span>${rangeEnd.toISOString().slice(0, 10)}</span>
  </div>
  <div style="position:relative">
    ${todayPct !== null ? `<div style="position:absolute;left:calc(160px + ${todayPct}%);top:0;bottom:0;width:2px;background:var(--red);z-index:1" title="오늘"></div>` : ''}
    ${rows}
  </div>
  <p class="note" style="margin-top:8px">
    <span style="display:inline-block;width:10px;height:10px;background:${STATUS_COLOR['시작전']};margin-right:4px;vertical-align:-1px"></span>시작전
    &nbsp;&nbsp;<span style="display:inline-block;width:10px;height:10px;background:${STATUS_COLOR['진행중']};margin-right:4px;vertical-align:-1px"></span>진행중
    &nbsp;&nbsp;<span style="display:inline-block;width:10px;height:10px;background:${STATUS_COLOR['완료']};margin-right:4px;vertical-align:-1px"></span>완료
    ${todayPct !== null ? '&nbsp;&nbsp;<span style="display:inline-block;width:2px;height:10px;background:var(--red);margin-right:4px;vertical-align:-1px"></span>오늘' : ''}
  </p>`;
}
