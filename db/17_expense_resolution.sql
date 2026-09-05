-- =====================================================================
-- 지급회의서(비용 지출증빙) 전용 컬럼 — 기안문/시행문과 성격이 달라 별도 필드로 분리
-- 계정과목은 새로 만들지 않고 기존 회계 시스템의 accounts 테이블(같은 Supabase 프로젝트)을
-- 그대로 참조한다 — 문서포털과 회계 시스템이 이 지점에서 실제로 연결된다.
-- =====================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS account_id BIGINT REFERENCES accounts(account_id);
COMMENT ON COLUMN documents.account_id IS '지급회의서 전용 — 지출 계정과목(회계 시스템 accounts 테이블 참조)';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS expense_amount NUMERIC(18,2);
COMMENT ON COLUMN documents.expense_amount IS '지급회의서 전용 — 지출금액';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS payee TEXT;
COMMENT ON COLUMN documents.payee IS '지급회의서 전용 — 지출처(거래처명)';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS evidence_type TEXT
    CHECK (evidence_type IN ('세금계산서', '계산서', '신용카드매출전표', '현금영수증', '기타'));
COMMENT ON COLUMN documents.evidence_type IS '지급회의서 전용 — 증빙유형(증빙서 자체는 첨부파일로 첨부)';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS tax_treatment TEXT
    CHECK (tax_treatment IN ('손금산입', '접대비', '기타'));
COMMENT ON COLUMN documents.tax_treatment IS '지급회의서 전용 — 세무처리구분';
