// 탭 전환 상태를 main.js에서 분리해둔 전용 모듈. 대시보드·일정관리의 "다른 탭 항목 하나를
// 바로 열기"(예: 프로젝트 마감일 클릭 → 프로젝트 탭에서 그 프로젝트 상세 보기) 기능이
// main.js를 거꾸로 import하지 않고도(순환참조 없이) 탭을 전환할 수 있게 한다.
let currentView = 'dashboard';
let renderFn = null;

export function setRenderer(fn) {
  renderFn = fn;
}

export function getCurrentView() {
  return currentView;
}

export function setCurrentView(view) {
  currentView = view;
}

// go()의 VIEW_RESET 없이 탭만 바꾼다 — openProject()처럼 호출 전에 미리 맞춰둔 모드를
// 유지한 채로 화면을 전환해야 하는 딥링크 용도.
export function navigate(view) {
  currentView = view;
  renderFn?.();
}
