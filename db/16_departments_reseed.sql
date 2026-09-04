-- =====================================================================
-- 부서 재구성 — 대표이사실 1개 → 경영지원팀/자산운용팀 2개
-- 경영지원팀: 경영 전반에 관한 문서 관리
-- 자산운용팀: 자산 운용 의사결정에 관한 문서 관리
--
-- 이미 14번을 옛 버전(대표이사실 시딩 포함)으로 실행해두신 경우와, 14번을 최신 버전으로
-- 새로 실행하신 경우(대표이사실 자체가 없는 경우) 둘 다 안전하게 통과하도록 작성했다 —
-- 재실행해도 안전(idempotent)하다.
-- =====================================================================

UPDATE departments SET dept_name = '경영지원팀', dept_code = 'MGMT'
WHERE dept_name = '대표이사실'
  AND NOT EXISTS (SELECT 1 FROM departments WHERE dept_name = '경영지원팀');

INSERT INTO departments (dept_name, dept_code, sort_order)
VALUES ('경영지원팀', 'MGMT', 0)
ON CONFLICT (dept_name) DO NOTHING;

INSERT INTO departments (dept_name, dept_code, sort_order)
VALUES ('자산운용팀', 'INV', 1)
ON CONFLICT (dept_name) DO NOTHING;
