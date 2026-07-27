-- 법인세 세무조정 관리 (세무사 검토 없이 셀프 신고하기 위한 최소 장치).
--
-- 회계이익과 세무상 소득은 다르다. 그 차이를 조정하는 게 세무조정이고, 두 갈래로 관리한다:
--   1) 소득금액조정합계표 — 당기 조정 내역(익금산입·손금불산입 / 손금산입·익금불산입)
--   2) 자본금과적립금조정명세서(을) — 유보 잔액의 기초·증가·감소·기말 이월관리
--
-- 이 회사에서 반드시 걸리는 항목: 매도가능증권평가익(33001).
-- 회계상 자본(기타포괄손익)으로 계상하지만 세무상 익금이 아니므로 △유보로 쌓아두고,
-- 해당 종목을 매도하는 시점에 익금산입으로 추인해야 한다. 이걸 놓치면 세무상 자산가액이
-- 회계장부와 어긋난 채 누적되어 처분 시점에 처분손익이 크게 틀어진다.
CREATE TABLE tax_adjustments (
    adjustment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fiscal_year   INT  NOT NULL,
    item_name     TEXT NOT NULL,               -- 예: 매도가능증권평가익
    -- 소득 조정 방향. 익금산입/손금불산입은 소득 증가(+), 손금산입/익금불산입은 소득 감소(-).
    adjust_type   TEXT NOT NULL CHECK (adjust_type IN ('익금산입','손금불산입','손금산입','익금불산입')),
    amount        NUMERIC(18,2) NOT NULL,
    -- 소득처분. 유보(△유보)만 다음 기로 이월되어 자본금과적립금조정명세서(을)에 남는다.
    disposal      TEXT NOT NULL CHECK (disposal IN ('유보','△유보','기타','상여','배당','기타사외유출')),
    account_id    BIGINT REFERENCES accounts(account_id),  -- 관련 계정(있으면)
    memo          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tax_adjustments IS '소득금액조정합계표 명세. disposal이 유보/△유보인 건은 유보관리대장으로 이월된다';
CREATE INDEX tax_adjustments_year_idx ON tax_adjustments(fiscal_year);

ALTER TABLE tax_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON tax_adjustments;
CREATE POLICY authenticated_full_access ON tax_adjustments
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
