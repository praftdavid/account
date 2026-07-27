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
