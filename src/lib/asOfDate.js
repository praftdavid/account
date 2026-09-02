import { todayStr } from './util.js';

export function asOfDatePickerHtml(inputId, value, years = []) {
  const currentYear = value.slice(0, 4);
  const yearOptions = years
    .map((y) => `<option value="${y}" ${String(y) === currentYear ? 'selected' : ''}>${y}년</option>`)
    .join('');

  return `<div class="toolbar">
    <label>기준일: </label>
    <input type="date" id="${inputId}" value="${value}">
    ${years.length ? `<select id="${inputId}_year">${yearOptions}</select>` : ''}
    <button type="button" class="btn ghost sm" data-quick="today">오늘</button>
    <button type="button" class="btn ghost sm" data-quick="h1">반기말(6/30)</button>
    <button type="button" class="btn ghost sm" data-quick="fy">연말(12/31)</button>
  </div>`;
}

// 반기말(6/30)·연말(12/31)만 허용하는 기준일 선택기 — 자유 날짜 입력을 막아야 하는 화면(증권 재평가 등)
// 에서도 위 asOfDatePickerHtml과 같은 시각적 패턴(연도 선택 + 퀵버튼)을 유지하기 위한 변형.
// 자유 입력(date input)과 "오늘" 버튼만 뺀다 — 미래 날짜에 해당하는 버튼은 비활성화한다.
export function halfYearEndPickerHtml(inputId, value, years = []) {
  const currentYear = value.slice(0, 4);
  const isH1 = value.slice(5, 7) === '06';
  const today = todayStr();
  const yearOptions = years
    .map((y) => `<option value="${y}" ${String(y) === currentYear ? 'selected' : ''}>${y}년</option>`)
    .join('');
  const h1Date = `${currentYear}-06-30`;
  const fyDate = `${currentYear}-12-31`;

  return `<div class="toolbar">
    <label>기준일: </label>
    <select id="${inputId}_year">${yearOptions}</select>
    <button type="button" class="btn ${isH1 ? '' : 'ghost'} sm" data-quick="h1" ${h1Date > today ? 'disabled' : ''}>반기말(6/30)</button>
    <button type="button" class="btn ${isH1 ? 'ghost' : ''} sm" data-quick="fy" ${fyDate > today ? 'disabled' : ''}>연말(12/31)</button>
  </div>`;
}

export function wireHalfYearEndPicker(inputId, onChange) {
  const yearSelect = document.getElementById(`${inputId}_year`);

  yearSelect.parentElement.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const year = yearSelect.value;
      onChange(btn.dataset.quick === 'h1' ? `${year}-06-30` : `${year}-12-31`);
    });
  });
}

export function wireAsOfDatePicker(inputId, onChange) {
  const input = document.getElementById(inputId);
  const yearSelect = document.getElementById(`${inputId}_year`);

  input.addEventListener('change', () => onChange(input.value));

  if (yearSelect) {
    yearSelect.addEventListener('change', () => onChange(`${yearSelect.value}-12-31`));
  }

  input.parentElement.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.quick === 'today') {
        onChange(todayStr());
        return;
      }
      const year = yearSelect?.value || input.value.slice(0, 4) || todayStr().slice(0, 4);
      if (btn.dataset.quick === 'h1') onChange(`${year}-06-30`);
      else if (btn.dataset.quick === 'fy') onChange(`${year}-12-31`);
    });
  });
}
