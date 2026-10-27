-- =====================================================================
-- 22b. 문서번호 새 양식으로 일괄 변환 (22a로 미리보기를 확인한 뒤 실행)
--   옛 양식  {부서명}_{연도}{일련번호}      예) 경영지원팀_202601
--   새 양식  프래프트({부서 약칭}){연도}-{일련번호 3자리}   예) 프래프트(경영)2026-001
--   부서 약칭 = 옛 번호의 부서명 앞 두 글자(경영지원팀 → 경영, 자산운용팀 → 자산)
--
-- 문서 번호(documents.doc_no)와, 번호를 글자로 복사해 둔 seal_logs.doc_no·document_events.note(상신 이력)를 함께 바꾼다.
-- 하나의 SQL 문장으로 처리하므로 중간에 실패하면 모두 취소된다(번호가 겹치면 unique 제약 때문에 전체가 취소된다).
-- 새 양식인 번호는 건드리지 않으므로 재실행해도 안전하다.
-- =====================================================================

WITH map AS (
  SELECT doc_id,
         doc_no AS old_no,
         '프래프트(' || left(m[1], 2) || ')' || m[2] || '-' || lpad(m[3], 3, '0') AS new_no
  FROM (
    SELECT doc_id, doc_no, regexp_match(doc_no, '^(.+)_([0-9]{4})([0-9]+)$') AS m
    FROM documents
    WHERE doc_no IS NOT NULL
  ) t
  WHERE m IS NOT NULL
),
u_seal AS (
  UPDATE seal_logs s SET doc_no = map.new_no
  FROM map WHERE s.doc_no = map.old_no
  RETURNING s.log_id
),
u_event AS (
  UPDATE document_events e SET note = map.new_no
  FROM map WHERE e.doc_id = map.doc_id AND e.note = map.old_no
  RETURNING e.event_id
),
u_doc AS (
  UPDATE documents d SET doc_no = map.new_no
  FROM map WHERE d.doc_id = map.doc_id
  RETURNING d.doc_id, map.old_no, d.doc_no AS new_no
)
SELECT old_no AS 옛번호, new_no AS 새번호 FROM u_doc ORDER BY new_no;
