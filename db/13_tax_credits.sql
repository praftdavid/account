-- 기납부세액 · 세액공제 관리 (선납세금 계정의 세무신고 측면 관리).
--
-- 선납세금(11106)에 쌓이는 돈은 신고서에서 두 갈래로 나뉜다. 자리를 헷갈리면 세액이 틀어진다:
--   · 기납부세액 — 중간예납세액, 원천납부세액(국내 이자·배당 원천징수분).
--     산출세액에서 그대로 빼는 "이미 낸 세금"이다. 한도 없음.
--   · 세액공제 — 외국납부세액공제(해외 배당·이자에 대해 외국에 낸 세금).
--     산출세액에서 빼되 한도가 있다: 산출세액 × (국외원천소득 ÷ 과세표준).
--     한도 초과분은 10년간 이월공제된다.
--
-- 그래서 credit_type으로 갈래를 구분하고, 외국납부세액은 한도 계산에 쓸 국외원천소득을 함께 받는다.
CREATE TABLE tax_credits (
    credit_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fiscal_year    INT  NOT NULL,
    credit_type    TEXT NOT NULL CHECK (credit_type IN ('중간예납','원천납부','외국납부세액','기타공제')),
    amount         NUMERIC(18,2) NOT NULL,
    foreign_income NUMERIC(18,2),   -- 외국납부세액공제 한도 계산용 국외원천소득(해당 건에 대응)
    paid_date      DATE,
    memo           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE tax_credits IS '기납부세액(중간예납·원천납부)과 세액공제(외국납부세액). 선납세금 계정 잔액과 대사한다';
CREATE INDEX tax_credits_year_idx ON tax_credits(fiscal_year);

ALTER TABLE tax_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON tax_credits;
CREATE POLICY authenticated_full_access ON tax_credits
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
