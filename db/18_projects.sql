-- =====================================================================
-- 프로젝트/업무관리 — 부서자료를 "완료 프로젝트 아카이브"로 바꾸면서 새로 추가.
-- 진행중 프로젝트는 [프로젝트] 탭에서 다루고, status='archived'로 바뀌면
-- [부서자료] 탭(아카이브)에서 읽기전용으로 보인다.
-- =====================================================================

CREATE TABLE IF NOT EXISTS projects (
    project_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dept_id     BIGINT NOT NULL REFERENCES departments(dept_id),
    title       TEXT   NOT NULL,
    description TEXT,
    status      TEXT   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    start_date  DATE,
    end_date    DATE,
    created_by  TEXT,
    archived_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS '부서별 진행 프로젝트 — 완료되면 status=archived로 바뀌어 부서자료(아카이브) 탭에서 보인다';

CREATE INDEX IF NOT EXISTS projects_dept_idx ON projects(dept_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

CREATE TABLE IF NOT EXISTS project_tasks (
    task_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title      TEXT   NOT NULL,
    assignee   TEXT,
    start_date DATE,
    due_date   DATE,
    status     TEXT   NOT NULL DEFAULT '시작전' CHECK (status IN ('시작전', '진행중', '완료')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE project_tasks IS '프로젝트 내 업무 — 목록 표와 간트 막대 둘 다 이 테이블 하나로 그린다';

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks(project_id);

CREATE TABLE IF NOT EXISTS project_notes (
    note_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    author_email TEXT,
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE project_notes IS '프로젝트 진행 메모 — 시간순 기록(예: 주주 통지 준비 현황 등 수시 메모)';

CREATE INDEX IF NOT EXISTS project_notes_project_idx ON project_notes(project_id);

-- 첨부파일(attachments)이 문서/규정/부서게시글 3종만 가리키던 걸 project/project_task까지 확장.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_target_type_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_target_type_check
    CHECK (target_type IN ('document', 'regulation', 'dept_post', 'project', 'project_task'));

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['projects', 'project_tasks', 'project_notes'])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I;', t);
        EXECUTE format(
            'CREATE POLICY authenticated_full_access ON %I
                FOR ALL TO authenticated USING (true) WITH CHECK (true);',
            t
        );
    END LOOP;
END $$;
