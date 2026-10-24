-- =====================================================================
-- 문서포털 확장 — 14번 이후 앱에서 직접 적용해 온 변경을 한 파일로 정리(전부 멱등).
--  · 일정관리 schedules, 매매일지 trade_logs
--  · 전자결재: 결재 이력 document_events, 서식 doc_templates, 직인 seals·seal_logs,
--    documents.status 'recalled'(회수됨) 추가, documents 직인 컬럼
--  · 서식에 HWPX 템플릿 파일 경로(doc_templates.hwpx_path)
-- 모든 테이블은 기존과 같이 RLS + authenticated 전체 접근 정책.
-- =====================================================================

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  due_date    DATE NOT NULL,
  memo        TEXT,
  done        BOOLEAN NOT NULL DEFAULT false,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_logs (
  trade_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_date  DATE NOT NULL,
  stock_name  TEXT NOT NULL,
  ticker      TEXT,
  side        TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity    NUMERIC NOT NULL,
  price       NUMERIC NOT NULL,
  strategy    TEXT,
  reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{category, detail}]
  rationale   TEXT,                                  -- 추가 메모(선택)
  review      TEXT,                                  -- 결과/복기(나중에 작성)
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seals (
  seal_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS doc_templates (
  template_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  doc_type    TEXT NOT NULL,
  title       TEXT,
  recipient   TEXT,
  issuer_name TEXT,
  body        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE doc_templates ADD COLUMN IF NOT EXISTS hwpx_path TEXT;
COMMENT ON COLUMN doc_templates.hwpx_path IS 'HWPX 템플릿 파일(portal-files 버킷 경로). {{자리표시}} 문구를 값으로 치환해 문서를 만든다';

ALTER TABLE documents ADD COLUMN IF NOT EXISTS seal_id   BIGINT REFERENCES seals(seal_id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sealed_by TEXT;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status = ANY (ARRAY['draft','submitted','approved','rejected','recalled']));

CREATE TABLE IF NOT EXISTS document_events (
  event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_id      BIGINT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,   -- create/submit/resubmit/approve/reject/recall/seal
  actor_email TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_events_doc_idx ON document_events(doc_id, created_at);

CREATE TABLE IF NOT EXISTS seal_logs (
  log_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_id     BIGINT REFERENCES documents(doc_id) ON DELETE SET NULL,
  doc_no     TEXT,
  doc_title  TEXT,
  seal_id    BIGINT REFERENCES seals(seal_id) ON DELETE SET NULL,
  seal_name  TEXT,
  sealed_by  TEXT,
  sealed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedules','trade_logs','seals','doc_templates','document_events','seal_logs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'authenticated_full_access') THEN
      EXECUTE format('CREATE POLICY authenticated_full_access ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;
