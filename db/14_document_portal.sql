-- =====================================================================
-- 문서포털(내부결재문서 · 제규정 · 부서별 업무자료) — 스키마
-- 회계 시스템(01~13)과 같은 Supabase 프로젝트를 공유하되 별도 앱(portal.html)에서 쓴다.
-- 원칙: 회계 스키마와 동일하게 단일 조직(1인 법인)용 — user_id/tenant_id 컬럼 없음,
--       RLS는 로그인(authenticated) 전원 전체 읽기/쓰기.
-- 결재 모델: 대표이사 1인 체제라 다단계 결재선을 두지 않는다 — 기안(draft) → 상신(submitted,
--           이 시점에 문서번호 채번) → 승인(approved) / 반려(rejected, 수정 후 재상신 가능).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. departments (부서 마스터)
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    dept_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_name   TEXT    NOT NULL,
    dept_code   TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT departments_name_uq UNIQUE (dept_name)
);
COMMENT ON TABLE departments IS '부서 마스터 — 전자결재 기안부서, 부서별 업무자료 게시판 구분에 공용으로 쓴다';

-- ---------------------------------------------------------------------
-- 2. documents (내부결재문서 / 전자결재)
-- ---------------------------------------------------------------------
CREATE TABLE documents (
    doc_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_no        TEXT,                              -- 상신 시점에 채번(예: PRAFT-2026-0001). 기안 중엔 NULL
    doc_type      TEXT    NOT NULL DEFAULT '일반기안', -- 자유 텍스트 분류(기안/품의/지출결의/휴가신청 등)
    title         TEXT    NOT NULL,
    dept_id       BIGINT  REFERENCES departments(dept_id),
    drafter_email TEXT    NOT NULL,                  -- 기안자(로그인 계정 이메일)
    body          TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    submitted_at  TIMESTAMPTZ,
    decided_at    TIMESTAMPTZ,
    decided_by    TEXT,                              -- 결재자 이메일
    decision_note TEXT,                               -- 승인/반려 사유(선택)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documents_doc_no_uq UNIQUE (doc_no)
);
COMMENT ON TABLE documents IS '내부결재문서 — 기안(draft)/상신(submitted)/승인(approved)/반려(rejected). 문서번호는 상신 시 채번(연도별 순번)';

CREATE INDEX documents_status_idx ON documents(status);
CREATE INDEX documents_dept_idx   ON documents(dept_id);

-- ---------------------------------------------------------------------
-- 3. regulations (제규정 — 사규·정관·지침 등)
-- ---------------------------------------------------------------------
CREATE TABLE regulations (
    reg_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category       TEXT    NOT NULL,                 -- 정관/규정/지침/서식/기타
    title          TEXT    NOT NULL,
    reg_no         TEXT,                              -- 규정 번호(선택)
    version        TEXT    NOT NULL DEFAULT '1.0',
    effective_date DATE,
    status         TEXT    NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'abolished')),
    body           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE regulations IS '제규정 — 사내 규정·정관·지침 게시판. 개정 시 version/effective_date를 갱신하고 이전 내용은 별도 이력 없이 덮어쓴다(단순 CMS)';

CREATE INDEX regulations_category_idx ON regulations(category);

-- ---------------------------------------------------------------------
-- 4. dept_posts (부서별 업무자료 게시글)
-- ---------------------------------------------------------------------
CREATE TABLE dept_posts (
    post_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_id      BIGINT  NOT NULL REFERENCES departments(dept_id),
    title        TEXT    NOT NULL,
    body         TEXT,
    author_email TEXT,
    pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE dept_posts IS '부서별 업무자료 — 부서 단위 공지·자료 게시판';

CREATE INDEX dept_posts_dept_idx ON dept_posts(dept_id);

-- ---------------------------------------------------------------------
-- 5. attachments (공용 첨부파일 — documents/regulations/dept_posts 공통)
-- ---------------------------------------------------------------------
CREATE TABLE attachments (
    attachment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_type   TEXT   NOT NULL CHECK (target_type IN ('document', 'regulation', 'dept_post')),
    target_id     BIGINT NOT NULL,
    file_name     TEXT   NOT NULL,
    storage_path  TEXT   NOT NULL,                   -- portal-files 버킷 내 경로
    file_size     BIGINT,
    uploaded_by   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE attachments IS '문서포털 공용 첨부파일 — target_type/target_id로 documents·regulations·dept_posts 중 하나를 가리킴(FK 대신 polymorphic 참조, 대상 테이블이 3개라 개별 FK 대신 앱에서 무결성 보장)';

CREATE INDEX attachments_target_idx ON attachments(target_type, target_id);

-- =====================================================================
-- RLS — 회계 스키마(03_rls_policies.sql)와 동일한 패턴: 로그인 전원 전체 허용
-- =====================================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'departments',
            'documents',
            'regulations',
            'dept_posts',
            'attachments'
        ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format(
            'DROP POLICY IF EXISTS authenticated_full_access ON %I;', t
        );
        EXECUTE format(
            'CREATE POLICY authenticated_full_access ON %I
                FOR ALL TO authenticated USING (true) WITH CHECK (true);',
            t
        );
    END LOOP;
END $$;

-- =====================================================================
-- Storage — 첨부파일 버킷. 비공개 버킷 + 로그인 전원 전체 허용(위 RLS 원칙과 동일선상).
-- 다운로드는 앱에서 createSignedUrl()로 서명 URL을 발급받아 처리한다(공개 URL 아님).
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-files', 'portal-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS portal_files_authenticated_full_access ON storage.objects;
CREATE POLICY portal_files_authenticated_full_access ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'portal-files')
    WITH CHECK (bucket_id = 'portal-files');

-- =====================================================================
-- 기초 데이터 — 부서가 하나도 없으면 문서포털 각 화면의 부서 선택란이 비어
-- 아무것도 못 만드는 상태로 시작하므로, 1인 법인 현재 구조에 맞는 기본 부서 하나를 넣어둔다.
-- 조직이 커지면 [기초정보 > 부서관리] 화면에서 추가하면 된다.
-- =====================================================================
INSERT INTO departments (dept_name, dept_code, sort_order)
VALUES ('대표이사실', 'CEO', 0)
ON CONFLICT (dept_name) DO NOTHING;
