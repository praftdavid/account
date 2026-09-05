-- =====================================================================
-- 문서포털 — 기안문/시행문/지급회의서 공식 양식 지원용 컬럼 추가
-- 사용자가 제공한 기존 공문서 서식(슬로건+회사명 레터헤드, 수신/제목/시행/공개구분)에 맞춰
-- documents 테이블을 조정한다.
--
-- 문서 종류는 "기안문/시행문/지급회의서" 3가지로 제한한다(doc_type CHECK).
-- 기안문과 시행문은 별도 필드로 구분하지 않고, 문서 하단에 표시되는 발송명의인
-- (issuer_name)이 있으면 시행문, 없으면 기안문 — 이라는 사용자 지정 규칙을 UI에서 강제한다
-- (issuer_name이 채워진 상태로 doc_type='시행문' 선택, 비어있으면 '기안문' 선택).
-- =====================================================================

-- 기존(migration 14) 기본값 '일반기안'이던 doc_type을 3종으로 제한.
-- 아직 실사용 데이터가 없는 시점이라 안전하게 DEFAULT와 CHECK를 함께 교체한다.
ALTER TABLE documents ALTER COLUMN doc_type SET DEFAULT '기안문';

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_ck;
ALTER TABLE documents ADD CONSTRAINT documents_doc_type_ck
    CHECK (doc_type IN ('기안문', '시행문', '지급회의서'));

ALTER TABLE documents ADD COLUMN IF NOT EXISTS issuer_name TEXT;
COMMENT ON COLUMN documents.issuer_name IS '발송명의인 — 채워지면 시행문 성격(문서 하단에 "회사명 {발송명의인}"으로 표시), 비어있으면 기안문';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS recipient TEXT;
COMMENT ON COLUMN documents.recipient IS '수신(자) — 시행문일 때 실제 수신 기관/담당자, 기안문·지급회의서는 보통 비워두면 "내부결재"로 표시';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS disclosure TEXT NOT NULL DEFAULT '공개'
    CHECK (disclosure IN ('공개', '부분공개', '비공개'));
COMMENT ON COLUMN documents.disclosure IS '공개구분 — 레터헤드 하단에 표시';
