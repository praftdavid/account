-- =====================================================================
-- 프래프트 관리회계 앱 — 데이터베이스 스키마 (PostgreSQL / Supabase)
-- 설계 문서: praft_accounting_app_design.md 기준
-- 규칙: 필드명 영문 snake_case, enum 값은 영문 코드(주석에 한글 병기),
--       계정명·적요 등 데이터 값은 한글.
-- 금액: NUMERIC(18,2) (원 기준, 외화 환산 여지 포함)
-- =====================================================================

-- 참고: 순환 FK(journal_entries.source_transaction_id ↔ raw_transactions.generated_entry_id)는
--       테이블 생성 후 ALTER 로 추가한다.

-- ---------------------------------------------------------------------
-- 1. fiscal_periods (회계기간)
-- ---------------------------------------------------------------------
CREATE TABLE fiscal_periods (
    period_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fiscal_year   INTEGER NOT NULL,                 -- 회계연도 (예: 2025)
    period_start  DATE    NOT NULL,
    period_end    DATE    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'open'    -- open=진행 / closed=마감
                  CHECK (status IN ('open', 'closed')),
    CONSTRAINT fiscal_periods_range_ck CHECK (period_end >= period_start),
    CONSTRAINT fiscal_periods_year_uq  UNIQUE (fiscal_year)
);
COMMENT ON TABLE fiscal_periods IS '회계기간 — 시산표 기간 구획 및 현금흐름표/자본변동표 비교기간 기준';

-- ---------------------------------------------------------------------
-- 2. accounts (계정과목 마스터)
-- ---------------------------------------------------------------------
CREATE TABLE accounts (
    account_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_code      TEXT    NOT NULL,             -- 5자리 계정코드(라벨). 계층은 parent_account_id로 판단
    account_name      TEXT    NOT NULL,             -- 계정명 (한글 값)
    account_type      TEXT    NOT NULL              -- asset/liability/equity/revenue/expense
                      CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
    normal_balance    TEXT    NOT NULL              -- debit=차변 / credit=대변 (차감계정 예외 포함)
                      CHECK (normal_balance IN ('debit','credit')),
    parent_account_id BIGINT  REFERENCES accounts(account_id),  -- 대→중→소→세목 계층(권위 소스)
    statement_section TEXT,                          -- 재무제표 표시 구분(유동자산/판관비 등)
    std_report_code   TEXT,                          -- 국세청 표준재무제표 표준용코드 매핑(신고 연계)
    tax_attribute     TEXT,                          -- v1.5 세무조정 속성(익금/손금 등)
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,  -- 삭제 대신 비활성화
    CONSTRAINT accounts_code_uq UNIQUE (account_code)
);
COMMENT ON TABLE accounts IS '계정과목 마스터 — 신규 계정은 row insert(재배포 불필요). 계층은 parent_account_id.';
COMMENT ON COLUMN accounts.std_report_code IS '법인세 신고 시 국세청 표준재무제표 코드로 변환하기 위한 매핑';

CREATE INDEX accounts_parent_idx ON accounts(parent_account_id);
CREATE INDEX accounts_type_idx   ON accounts(account_type);

-- ---------------------------------------------------------------------
-- 3. financial_accounts (계좌 마스터)
-- ---------------------------------------------------------------------
CREATE TABLE financial_accounts (
    fin_account_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_kind        TEXT NOT NULL               -- bank=은행 / securities=증권
                        CHECK (account_kind IN ('bank','securities')),
    institution_name    TEXT NOT NULL,              -- 기관명
    account_no_masked   TEXT,                        -- 마스킹 계좌번호
    linked_gl_account_id BIGINT REFERENCES accounts(account_id),  -- 대응 원장계정(예: 보통예금)
    is_active           BOOLEAN NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE financial_accounts IS '업로드 대상 은행·증권 계좌. 자동 분개의 현금 다리 확정 및 계좌간 이체 매칭 기준';

-- ---------------------------------------------------------------------
-- 4. import_batches (업로드 배치)
-- ---------------------------------------------------------------------
CREATE TABLE import_batches (
    import_batch_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fin_account_id  BIGINT REFERENCES financial_accounts(fin_account_id),
    source_filename TEXT,
    imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_count       INTEGER
);
COMMENT ON TABLE import_batches IS '업로드 이력·재처리 추적';

-- ---------------------------------------------------------------------
-- 5. mapping_rules (매핑 규칙 — 외부화, 학습 루프)
-- ---------------------------------------------------------------------
CREATE TABLE mapping_rules (
    rule_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_type       TEXT NOT NULL                  -- memo=적요 / counterparty=상대방 / txn_type=거래유형
                     CHECK (match_type IN ('memo','counterparty','txn_type')),
    match_pattern    TEXT NOT NULL,                 -- 매칭 패턴(문자열/정규식)
    target_account_id BIGINT NOT NULL REFERENCES accounts(account_id),
    fin_account_scope BIGINT REFERENCES financial_accounts(fin_account_id),  -- 특정 계좌 한정(선택)
    priority         INTEGER NOT NULL DEFAULT 100,   -- 낮을수록 우선
    is_active        BOOLEAN NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE mapping_rules IS '거래→계정 매핑 규칙. 사용자 수정이 여기 축적되어 다음번 정확도 상승(학습 루프)';

CREATE INDEX mapping_rules_active_idx ON mapping_rules(is_active, priority);

-- ---------------------------------------------------------------------
-- 6. journal_entries (전표 헤더)
--    source_transaction_id FK 는 raw_transactions 생성 후 ALTER 로 추가
-- ---------------------------------------------------------------------
CREATE TABLE journal_entries (
    entry_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_no             TEXT,                        -- 전표번호(표시용)
    entry_date           DATE   NOT NULL,
    period_id            BIGINT NOT NULL REFERENCES fiscal_periods(period_id),
    description          TEXT,                        -- 적요
    source_type          TEXT   NOT NULL DEFAULT 'manual'  -- manual/auto/closing/opening
                         CHECK (source_type IN ('manual','auto','closing','opening')),
    source_transaction_id BIGINT,                     -- 자동일 때만 (FK 아래 ALTER 에서 추가)
    status               TEXT   NOT NULL DEFAULT 'draft'   -- draft=미확정 / posted=전기 / void=취소
                         CHECK (status IN ('draft','posted','void')),
    posted_at            TIMESTAMPTZ
);
COMMENT ON TABLE journal_entries IS '전표 헤더. 자동 분개는 draft로 시작, 사용자 승인 시 posted 전기';
COMMENT ON COLUMN journal_entries.source_type IS 'manual=수기 / auto=자동 / closing=마감분개 / opening=개시분개';

CREATE INDEX journal_entries_period_idx ON journal_entries(period_id);
CREATE INDEX journal_entries_date_idx   ON journal_entries(entry_date);
CREATE INDEX journal_entries_status_idx ON journal_entries(status);

-- ---------------------------------------------------------------------
-- 7. raw_transactions (원천 거래 — 원본 보존·불변)
-- ---------------------------------------------------------------------
CREATE TABLE raw_transactions (
    raw_txn_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fin_account_id  BIGINT NOT NULL REFERENCES financial_accounts(fin_account_id),
    import_batch_id BIGINT REFERENCES import_batches(import_batch_id),
    txn_date        DATE   NOT NULL,
    amount          NUMERIC(18,2) NOT NULL,          -- 부호: +입금 / −출금
    memo            TEXT,                            -- 적요
    balance_after   NUMERIC(18,2),                   -- 거래후 잔액
    dedup_key       TEXT,                            -- 중복 제거 키
    status          TEXT NOT NULL DEFAULT 'unmapped' -- unmapped/mapped/journalized/ignored
                    CHECK (status IN ('unmapped','mapped','journalized','ignored')),
    generated_entry_id BIGINT REFERENCES journal_entries(entry_id),  -- 생성된 전표
    CONSTRAINT raw_transactions_dedup_uq UNIQUE (dedup_key)
);
COMMENT ON TABLE raw_transactions IS '업로드된 은행/증권 원본 거래(불변). 매핑 오류 시 여기서 재처리';

CREATE INDEX raw_transactions_account_idx ON raw_transactions(fin_account_id, txn_date);
CREATE INDEX raw_transactions_status_idx  ON raw_transactions(status);

-- 순환 FK 추가: journal_entries.source_transaction_id → raw_transactions
ALTER TABLE journal_entries
    ADD CONSTRAINT journal_entries_src_txn_fk
    FOREIGN KEY (source_transaction_id) REFERENCES raw_transactions(raw_txn_id);

-- ---------------------------------------------------------------------
-- 8. journal_lines (분개상세) — 단일 진실원천
-- ---------------------------------------------------------------------
CREATE TABLE journal_lines (
    line_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_id      BIGINT NOT NULL REFERENCES journal_entries(entry_id) ON DELETE CASCADE,
    account_id    BIGINT NOT NULL REFERENCES accounts(account_id),
    debit_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,  -- 차변
    credit_amount NUMERIC(18,2) NOT NULL DEFAULT 0,  -- 대변
    segment       TEXT                                -- invest=투자 / commerce=전자상거래 / common=공통
                  CHECK (segment IN ('invest','commerce','common')),
    -- 한 줄에는 차·대 한쪽만 값을 가진다
    CONSTRAINT journal_lines_one_side_ck
        CHECK ((debit_amount = 0) OR (credit_amount = 0)),
    -- 금액은 음수 불가
    CONSTRAINT journal_lines_nonneg_ck
        CHECK (debit_amount >= 0 AND credit_amount >= 0)
);
COMMENT ON TABLE journal_lines IS '분개상세. 모든 재무제표의 단일 진실원천';
COMMENT ON COLUMN journal_lines.segment IS 'invest=투자 / commerce=전자상거래 / common=공통. 관리 뷰는 group by, 표준재무제표는 무시하고 합산';

CREATE INDEX journal_lines_entry_idx   ON journal_lines(entry_id);
CREATE INDEX journal_lines_account_idx ON journal_lines(account_id);
CREATE INDEX journal_lines_segment_idx ON journal_lines(segment);

-- 전표 균형 제약: 한 전표 내 Σdebit = Σcredit (posted 기준 강제)
-- 테이블 CHECK 로는 불가하므로 constraint trigger 로 지연 검증
CREATE OR REPLACE FUNCTION check_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_id BIGINT;
    v_diff     NUMERIC(18,2);
    v_status   TEXT;
BEGIN
    v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);

    SELECT status INTO v_status FROM journal_entries WHERE entry_id = v_entry_id;
    -- draft/void 는 작성 중이므로 균형 미검증, posted 만 강제
    IF v_status IS DISTINCT FROM 'posted' THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(debit_amount),0) - COALESCE(SUM(credit_amount),0)
      INTO v_diff
      FROM journal_lines
     WHERE entry_id = v_entry_id;

    IF v_diff <> 0 THEN
        RAISE EXCEPTION '전표 % 차대 불일치: 차변−대변 = %', v_entry_id, v_diff;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balanced_trg
    AFTER INSERT OR UPDATE OR DELETE ON journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();

-- ---------------------------------------------------------------------
-- 9. balance_snapshots (잔액증명서 앵커)
-- ---------------------------------------------------------------------
CREATE TABLE balance_snapshots (
    snapshot_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fin_account_id    BIGINT NOT NULL REFERENCES financial_accounts(fin_account_id),
    as_of_date        DATE   NOT NULL,
    certified_balance NUMERIC(18,2) NOT NULL,        -- 잔액증명서상 기말 잔액
    CONSTRAINT balance_snapshots_uq UNIQUE (fin_account_id, as_of_date)
);
COMMENT ON TABLE balance_snapshots IS '잔액증명서 앵커. 파생 잔액과 대사하는 자동 회귀 테스트 기준';

-- ---------------------------------------------------------------------
-- 10. securities_lots (증권 로트/포지션 — 투자 보조원장, §8-A)
-- ---------------------------------------------------------------------
CREATE TABLE securities_lots (
    lot_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticker          TEXT,
    name            TEXT NOT NULL,                   -- 종목명
    acquire_date    DATE NOT NULL,
    quantity        NUMERIC(18,4) NOT NULL,          -- 수량(해외주식 소수점 대비)
    unit_cost       NUMERIC(18,4) NOT NULL,          -- 취득단가
    cost_basis      NUMERIC(18,2) NOT NULL,          -- 취득원가
    fair_value      NUMERIC(18,2),                   -- 기말 공정가치
    unrealized_oci  NUMERIC(18,2) NOT NULL DEFAULT 0,-- 누적 평가익(→ 매도가능증권평가익, 자본)
    status          TEXT NOT NULL DEFAULT 'open'     -- open=보유 / closed=매각완료
                    CHECK (status IN ('open','closed')),
    close_date      DATE
);
COMMENT ON TABLE securities_lots IS '증권 로트별 취득원가·평가익 추적. FIFO 매각 시 실현손익(→금융매출)과 환입 OCI 산출';

CREATE INDEX securities_lots_status_idx ON securities_lots(status);

-- =====================================================================
-- 파생 뷰 예시 (재무제표는 모두 journal_lines 위의 조회로 도출)
-- =====================================================================

-- 합계잔액시산표 (posted 기준)
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT a.account_id,
       a.account_code,
       a.account_name,
       a.account_type,
       SUM(jl.debit_amount)  AS total_debit,
       SUM(jl.credit_amount) AS total_credit,
       SUM(jl.debit_amount) - SUM(jl.credit_amount) AS balance
FROM journal_lines jl
JOIN journal_entries je ON je.entry_id = jl.entry_id
JOIN accounts a         ON a.account_id = jl.account_id
WHERE je.status = 'posted'
GROUP BY a.account_id, a.account_code, a.account_name, a.account_type;

-- 부문별(관리) 손익 뷰
CREATE OR REPLACE VIEW v_pl_by_segment AS
SELECT COALESCE(jl.segment,'common') AS segment,
       a.account_type,
       a.account_name,
       SUM(jl.credit_amount - jl.debit_amount) AS amount  -- 수익(+)/비용(−) 성격
FROM journal_lines jl
JOIN journal_entries je ON je.entry_id = jl.entry_id
JOIN accounts a         ON a.account_id = jl.account_id
WHERE je.status = 'posted'
  AND a.account_type IN ('revenue','expense')
GROUP BY COALESCE(jl.segment,'common'), a.account_type, a.account_name;

-- =====================================================================
-- 끝. 다음: 시드 데이터(계정과목표, 회계기간) 및 애플리케이션 레이어.
-- =====================================================================
