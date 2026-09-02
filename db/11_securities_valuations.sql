-- 기준일별 종목 포지션 스냅샷(잔고증명서 기준).
--
-- 평가이익은 시점에 따라 달라지므로 로트(원가)만으로는 산출할 수 없다. 잔고증명서를 발급받는
-- 결산 시점마다 종목별 수량·취득원가·평가금액을 여기 적재하고, 보유종목 현황 화면이 기준일로 조회한다.
--     평가이익 = 평가금액 - 취득원가   (→ 33001 매도가능증권평가익, 기타포괄손익누계액)
--
-- 검증된 사실: 매도가능증권은 공정가치로 계상되므로 평가금액 합계가 재무상태표 잔액과 정확히 일치한다.
--     2025-12-31: 50,039,853 + 16,898,428 = 66,938,281 = GL 11104 잔액 (일치)
--     2026-06-30: 51,255,612 + 19,016,281 = 70,271,893 = GL 11104 잔액 (일치)
-- 반면 취득원가는 원본 거래를 이동평균으로 재생해 복원한 값이라 실제 분개 환율과의 차이만큼
-- 오차가 남는다(2026-06-30 기준 38,593원, 0.05%). 화면 대사표에서 이 둘을 구분해 보여준다.
CREATE TABLE securities_valuations (
    valuation_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fin_account_id BIGINT NOT NULL REFERENCES financial_accounts(fin_account_id),
    as_of_date     DATE   NOT NULL,
    ticker         TEXT   NOT NULL,
    name           TEXT,
    quantity       NUMERIC(18,4) NOT NULL,
    unit_price     NUMERIC(18,4),          -- 평가단가(원)
    fair_value     NUMERIC(18,2) NOT NULL, -- 평가금액(원) — 잔고증명서 실측
    cost_basis     NUMERIC(18,2),          -- 취득원가(원) — 이동평균 재생값
    source         TEXT,
    CONSTRAINT securities_valuations_uq UNIQUE (fin_account_id, as_of_date, ticker)
);
COMMENT ON TABLE securities_valuations IS '기준일별 종목 포지션 스냅샷. 잔고증명서 발급 시점마다 적재 — 평가이익(OCI) 산출 근거';
CREATE INDEX securities_valuations_date_idx ON securities_valuations(as_of_date);

ALTER TABLE securities_valuations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON securities_valuations;
CREATE POLICY authenticated_full_access ON securities_valuations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 잔고증명서 실측 평가금액 + 이동평균 재생 취득원가 (2843=fin_account_id 2, 2845=3)
INSERT INTO securities_valuations (fin_account_id, as_of_date, ticker, name, quantity, unit_price, fair_value, cost_basis, source) VALUES
    (2, '2025-12-31', 'AXP',   '아메리칸엑스프레스',       3,  530841.25,  1592523,  1160219, '잔고증명서'),
    (2, '2025-12-31', 'COIN',  '코인베이스글로벌',         9,  324488.28,  2920394,  3999934, '잔고증명서'),
    (2, '2025-12-31', 'GOOGL', '알파벳A',               14,  449123.70,  6287731,  5856504, '잔고증명서'),
    (2, '2025-12-31', 'TSLA',  '테슬라',                50,  645303.22, 32265161, 21559402, '잔고증명서'),
    (2, '2025-12-31', 'VRT',   '버티브홀딩스',            30,  232468.14,  6974044,  5832945, '잔고증명서'),
    (3, '2025-12-31', 'AGG',   '미국채권아이셰어즈ETF',     44,  143317.81,  6305983,  6160430, '잔고증명서'),
    (3, '2025-12-31', 'IAU',   '금아이셰어즈ETF',         15,  116470.83,  1747062,  1240869, '잔고증명서'),
    (3, '2025-12-31', 'IVV',   'S&P500코어아이셰어즈ETF',  9,  982820.40,  8845383,  7593061, '잔고증명서'),
    (2, '2026-06-30', 'GOOGL', '알파벳A',               31,  550885.85, 17077461, 14062604, '잔고증명서'),
    (2, '2026-06-30', 'IBM',   'IBM',                  13,  433485.21,  5635307,  5603635, '잔고증명서'),
    (2, '2026-06-30', 'IONQ',  '아이온큐',               20,   82100.29,  1642005,  1647789, '잔고증명서'),
    (2, '2026-06-30', 'MRVL',  '마벨테크놀로지그룹',        4,  459197.43,  1836789,  1804065, '잔고증명서'),
    (2, '2026-06-30', 'TSLA',  '테슬라',                10,  648354.90,  6483549,  4301257, '잔고증명서'),
    (2, '2026-06-30', 'VRT',   '버티브홀딩스',            36,  516125.03, 18580501,  8681714, '잔고증명서'),
    (3, '2026-06-30', 'AGG',   '미국채권아이셰어즈ETF',     10,  152577.67,  1525776,  1402947, '잔고증명서'),
    (3, '2026-06-30', 'IAU',   '금아이셰어즈ETF',         23,  116398.66,  2677169,  2337143, '잔고증명서'),
    (3, '2026-06-30', 'IVV',   'S&P500코어아이셰어즈ETF', 10, 1154413.93, 11544139,  8571634, '잔고증명서'),
    (3, '2026-06-30', 'QQQ',   '나스닥100인베스코ETF',     7,  467028.25,  3269197,  2901271, '잔고증명서');
