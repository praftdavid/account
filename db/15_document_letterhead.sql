-- =====================================================================
-- 문서포털 — 기안문/시행문 공식 양식 지원용 컬럼 추가
-- 사용자가 제공한 기존 공문서 서식(슬로건+회사명 레터헤드, 수신/제목/시행/공개구분)에 맞춰
-- documents 테이블에 문서 구분·수신자·공개구분을 추가한다.
-- 용어: 내부문서 = "기안문"(doc_scope='internal'), 타기관 발송 = "시행문"(doc_scope='external')
-- =====================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_scope TEXT NOT NULL DEFAULT 'internal'
    CHECK (doc_scope IN ('internal', 'external'));
COMMENT ON COLUMN documents.doc_scope IS '내부문서(기안문)/외부발송(시행문) 구분';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient TEXT;
COMMENT ON COLUMN documents.recipient IS '수신(자) — 기안문은 보통 비워두거나 "내부결재", 시행문은 실제 수신 기관/담당자';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS disclosure TEXT NOT NULL DEFAULT '공개'
    CHECK (disclosure IN ('공개', '부분공개', '비공개'));
COMMENT ON COLUMN documents.disclosure IS '공개구분 — 레터헤드 하단에 표시';
