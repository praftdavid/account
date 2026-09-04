-- =====================================================================
-- 부서 재구성 — 대표이사실 1개 → 경영지원팀/자산운용팀 2개
-- 경영지원팀: 경영 전반에 관한 문서 관리
-- 자산운용팀: 자산 운용 의사결정에 관한 문서 관리
-- 아직 실사용 데이터가 없는 시점이라 기존 시드 행을 이름만 바꿔 재사용하고, 자산운용팀을 새로 추가한다.
-- =====================================================================

UPDATE departments SET dept_name = '경영지원팀', dept_code = 'MGMT'
WHERE dept_name = '대표이사실';

INSERT INTO departments (dept_name, dept_code, sort_order)
VALUES ('자산운용팀', 'INV', 1)
ON CONFLICT (dept_name) DO NOTHING;
