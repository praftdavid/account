// 일정 분류. SCHEDULE_CATEGORIES는 수동으로 일정을 등록할 때 고르는 분류(프로젝트는 projects
// 테이블에서 자동으로 가져오므로 수동 등록 대상이 아니다). DISPLAY_CATEGORIES는 목록 필터
// 탭과 대시보드에 보여줄 전체 분류 순서로, 자동으로 들어오는 "프로젝트"가 기타 앞에 추가된다.
export const SCHEDULE_CATEGORIES = ['세무', '주주총회', '기타'];
export const DISPLAY_CATEGORIES = ['세무', '주주총회', '프로젝트', '기타'];

// 달력 날짜 밑에 찍는 점 색. 분류가 한눈에 구분되게 세무=초록, 주주총회=빨강, 프로젝트=노랑.
export const CATEGORY_DOT_COLOR = {
  세무: 'var(--green)',
  주주총회: 'var(--red)',
  프로젝트: 'var(--amber)',
  기타: 'var(--text-mute)',
};
