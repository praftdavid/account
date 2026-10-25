-- =====================================================================
-- 22. 문서번호 새 양식으로 일괄 변환
--   옛 양식  {부서명}_{연도}{일련번호}      예) 경영지원팀_202601
--   새 양식  프래프트({부서 약칭}){연도}-{일련번호 3자리}   예) 프래프트(경영)2026-001
--   부서 약칭 = 옛 번호의 부서명 앞 두 글자(경영지원팀 → 경영, 자산운용팀 → 자산)
--
-- documents.doc_no와, 번호를 글자로 복사해 둔 seal_logs.doc_no·document_events.note(상신 이력)를 함께 바꾼다.
-- 새 양식인 번호는 건드리지 않으므로 재실행해도 안전하다. 새 번호가 겹치면 아무것도 바꾸지 않고 멈춘다.
-- =====================================================================

BEGIN;

CREATE TEMP TABLE _docno_map ON COMMIT DROP AS
SELECT doc_id,
       doc_no AS old_no,
       '프래프트(' || left(m[1], 2) || ')' || m[2] || '-' || lpad(m[3], 3, '0') AS new_no
FROM (
  SELECT doc_id, doc_no, regexp_match(doc_no, '^(.+)_([0-9]{4})([0-9]+)$') AS m
  FROM documents
  WHERE doc_no IS NOT NULL
) t
WHERE m IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _docno_map GROUP BY new_no HAVING count(*) > 1) THEN
    RAISE EXCEPTION '변환 결과 번호가 겹칩니다(부서 약칭이 같은 부서가 있는지 확인하세요). 아무것도 바꾸지 않았습니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM _docno_map mp JOIN documents d ON d.doc_no = mp.new_no) THEN
    RAISE EXCEPTION '이미 같은 새 번호를 가진 문서가 있습니다. 아무것도 바꾸지 않았습니다.';
  END IF;
END $$;

UPDATE seal_logs s SET doc_no = mp.new_no FROM _docno_map mp WHERE s.doc_no = mp.old_no;
UPDATE document_events e SET note = mp.new_no FROM _docno_map mp WHERE e.doc_id = mp.doc_id AND e.note = mp.old_no;
UPDATE documents d SET doc_no = mp.new_no FROM _docno_map mp WHERE d.doc_id = mp.doc_id;

-- 바뀐 내역 확인
SELECT old_no AS 옛번호, new_no AS 새번호 FROM _docno_map ORDER BY new_no;

COMMIT;
