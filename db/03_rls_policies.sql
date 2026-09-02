-- =====================================================================
-- 프래프트 관리회계 앱 — RLS(행 수준 보안) 정책
-- 대상: praft_schema.sql 로 생성된 스키마
-- 원칙: 단일 조직(가족 법인)용 앱이므로 user_id/tenant_id 컬럼 없음.
--       모든 테이블에 RLS를 켜고, 로그인(authenticated)한 사용자는
--       전체 읽기/쓰기 가능, 비로그인(anon)은 완전 차단한다.
-- =====================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'fiscal_periods',
            'accounts',
            'financial_accounts',
            'import_batches',
            'mapping_rules',
            'journal_entries',
            'raw_transactions',
            'journal_lines',
            'balance_snapshots',
            'securities_lots'
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
-- 끝. 로그인 계정(이메일/비밀번호)은 Supabase 대시보드 Authentication
-- 메뉴에서 직접 생성한다(가입 폼 없음).
-- =====================================================================
