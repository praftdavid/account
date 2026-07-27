-- =====================================================================
-- 프래프트 관리회계 앱 — 증권 매매·배당금 자동분개 (2차 목표: 자동분개 핵심 기능)
-- 내용: (1) fx_rates 환율 참조테이블 (2) securities_transactions 파싱 원본
--       (3) securities_lots 확장(계좌 구분 추가, 이동평균 포지션 저장소로 재사용)
--       (4) RLS 정책 (5) fx_rates 2025년 실제 환율 99건 시딩
--       (출처: 세무사가 2025년 결산에 실제로 쓴 거래내역정리(2025)_이동평균.xlsx의
--        "환율참조표" 시트 — 하나은행 과거환율조회/poundsterlinglive/exchange-rates.org)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. fx_rates (환율 참조테이블)
-- ---------------------------------------------------------------------
CREATE TABLE fx_rates (
    fx_rate_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rate_date   DATE NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'USD',
    rate        NUMERIC(10,4) NOT NULL,          -- 원/외화 1단위
    source      TEXT,                             -- 출처(참고용)
    CONSTRAINT fx_rates_uq UNIQUE (rate_date, currency)
);
COMMENT ON TABLE fx_rates IS '증권 매매·배당금 원화 환산용 일별 환율. 새 날짜는 Claude가 외부 조회해 직접 채워넣는다(앱이 브라우저에서 API를 직접 호출하지 않음)';

-- ---------------------------------------------------------------------
-- 2. securities_transactions (증권 매수/매도/배당 파싱 원본 — 불변)
-- ---------------------------------------------------------------------
CREATE TABLE securities_transactions (
    sec_txn_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fin_account_id  BIGINT NOT NULL REFERENCES financial_accounts(fin_account_id),
    import_batch_id BIGINT REFERENCES import_batches(import_batch_id),
    txn_date        DATE NOT NULL,
    txn_type        TEXT NOT NULL CHECK (txn_type IN ('buy','sell','dividend')),
    ticker          TEXT,
    name            TEXT,
    quantity        NUMERIC(18,4),
    unit_price_usd  NUMERIC(18,4),
    fee_usd         NUMERIC(18,4) NOT NULL DEFAULT 0,
    gross_usd       NUMERIC(18,4),                 -- 매수/매도: 수량×단가. 배당: 총배당금
    tax_usd         NUMERIC(18,4) NOT NULL DEFAULT 0,  -- 배당 원천징수세(외국납부세액)
    dedup_key       TEXT UNIQUE,
    status          TEXT NOT NULL DEFAULT 'unmapped'
                    CHECK (status IN ('unmapped','journalized','ignored')),
    generated_entry_id BIGINT REFERENCES journal_entries(entry_id)
);
COMMENT ON TABLE securities_transactions IS '키움증권 CSV/PDF에서 파싱한 매수·매도·배당 원본. 환율 적용해 자동분개 생성 시 journalized로 전환';

CREATE INDEX securities_transactions_account_idx ON securities_transactions(fin_account_id, txn_date);
CREATE INDEX securities_transactions_status_idx  ON securities_transactions(status);

-- ---------------------------------------------------------------------
-- 3. securities_lots 확장 — 계좌 구분 추가, 이동평균 포지션 저장소로 재사용
--    (FIFO 여러 로트 대신, 종목×계좌당 레코드 1개를 매수 시마다 가중평균으로 갱신)
-- ---------------------------------------------------------------------
ALTER TABLE securities_lots ADD COLUMN fin_account_id BIGINT REFERENCES financial_accounts(fin_account_id);
CREATE UNIQUE INDEX securities_lots_account_ticker_uq ON securities_lots(fin_account_id, ticker) WHERE status = 'open';

-- ---------------------------------------------------------------------
-- 4. RLS — 신규 테이블 2개 추가(securities_lots는 이미 03_rls_policies.sql에 포함됨)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['fx_rates', 'securities_transactions'])
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

-- ---------------------------------------------------------------------
-- 5. fx_rates 시딩 — 2025년 실제 일별 환율 99건
-- ---------------------------------------------------------------------
INSERT INTO fx_rates (rate_date, currency, rate, source) VALUES
    ('2025-02-19', 'USD', 1440.99, 'exchange-rates.org'),
    ('2025-02-20', 'USD', 1432.70, 'exchange-rates.org'),
    ('2025-02-21', 'USD', 1436.84, 'exchange-rates.org'),
    ('2025-02-24', 'USD', 1429.65, 'exchange-rates.org'),
    ('2025-02-25', 'USD', 1430.49, 'exchange-rates.org'),
    ('2025-02-26', 'USD', 1435.41, 'exchange-rates.org'),
    ('2025-02-27', 'USD', 1450.86, 'exchange-rates.org'),
    ('2025-02-28', 'USD', 1461.80, 'exchange-rates.org'),
    ('2025-03-03', 'USD', 1458.93, 'exchange-rates.org'),
    ('2025-03-04', 'USD', 1453.85, 'exchange-rates.org'),
    ('2025-03-05', 'USD', 1444.15, 'exchange-rates.org'),
    ('2025-03-06', 'USD', 1447.31, 'exchange-rates.org'),
    ('2025-03-07', 'USD', 1447.17, 'exchange-rates.org'),
    ('2025-03-10', 'USD', 1458.02, 'exchange-rates.org'),
    ('2025-03-11', 'USD', 1452.01, 'exchange-rates.org'),
    ('2025-03-12', 'USD', 1449.75, 'exchange-rates.org'),
    ('2025-03-13', 'USD', 1453.68, 'exchange-rates.org'),
    ('2025-03-14', 'USD', 1451.11, 'exchange-rates.org'),
    ('2025-03-15', 'USD', 1451.11, 'exchange-rates.org'),
    ('2025-03-17', 'USD', 1443.58, 'exchange-rates.org'),
    ('2025-03-18', 'USD', 1449.93, 'exchange-rates.org'),
    ('2025-04-04', 'USD', 1459.51, 'poundsterlinglive'),
    ('2025-04-07', 'USD', 1470.92, 'poundsterlinglive'),
    ('2025-04-08', 'USD', 1487.09, 'poundsterlinglive'),
    ('2025-04-09', 'USD', 1446.50, 'poundsterlinglive'),
    ('2025-04-10', 'USD', 1453.89, 'poundsterlinglive'),
    ('2025-04-22', 'USD', 1430.17, 'poundsterlinglive'),
    ('2025-04-24', 'USD', 1431.03, 'poundsterlinglive'),
    ('2025-05-08', 'USD', 1405.23, 'poundsterlinglive'),
    ('2025-05-09', 'USD', 1396.11, 'poundsterlinglive'),
    ('2025-05-12', 'USD', 1416.96, 'poundsterlinglive'),
    ('2025-07-21', 'USD', 1382.79, 'poundsterlinglive'),
    ('2025-07-22', 'USD', 1380.77, 'poundsterlinglive'),
    ('2025-07-23', 'USD', 1374.87, 'poundsterlinglive'),
    ('2025-07-30', 'USD', 1393.54, 'poundsterlinglive'),
    ('2025-07-31', 'USD', 1393.32, 'poundsterlinglive'),
    ('2025-08-01', 'USD', 1388.55, 'poundsterlinglive'),
    ('2025-08-04', 'USD', 1385.58, 'poundsterlinglive'),
    ('2025-08-07', 'USD', 1383.67, 'poundsterlinglive'),
    ('2025-08-08', 'USD', 1388.96, 'poundsterlinglive'),
    ('2025-08-11', 'USD', 1391.17, 'poundsterlinglive'),
    ('2025-08-12', 'USD', 1384.17, 'poundsterlinglive'),
    ('2025-08-18', 'USD', 1388.92, 'poundsterlinglive'),
    ('2025-08-19', 'USD', 1393.28, 'poundsterlinglive'),
    ('2025-08-20', 'USD', 1397.92, 'poundsterlinglive'),
    ('2025-08-21', 'USD', 1401.18, 'poundsterlinglive'),
    ('2025-08-29', 'USD', 1388.97, 'poundsterlinglive'),
    ('2025-09-01', 'USD', 1393.02, 'poundsterlinglive'),
    ('2025-09-02', 'USD', 1395.80, 'poundsterlinglive'),
    ('2025-09-03', 'USD', 1390.40, 'poundsterlinglive'),
    ('2025-09-04', 'USD', 1393.52, 'poundsterlinglive'),
    ('2025-09-05', 'USD', 1386.97, 'poundsterlinglive'),
    ('2025-09-06', 'USD', 1386.97, 'poundsterlinglive'),
    ('2025-09-08', 'USD', 1385.27, 'poundsterlinglive'),
    ('2025-09-09', 'USD', 1389.26, 'poundsterlinglive'),
    ('2025-09-10', 'USD', 1389.33, 'poundsterlinglive'),
    ('2025-09-11', 'USD', 1389.66, 'poundsterlinglive'),
    ('2025-09-12', 'USD', 1393.04, 'poundsterlinglive'),
    ('2025-09-13', 'USD', 1393.04, 'poundsterlinglive'),
    ('2025-09-15', 'USD', 1385.18, 'poundsterlinglive'),
    ('2025-09-16', 'USD', 1378.80, 'poundsterlinglive'),
    ('2025-09-17', 'USD', 1380.71, 'poundsterlinglive'),
    ('2025-09-19', 'USD', 1397.23, 'poundsterlinglive'),
    ('2025-09-22', 'USD', 1391.20, 'poundsterlinglive'),
    ('2025-09-23', 'USD', 1394.46, 'poundsterlinglive'),
    ('2025-09-26', 'USD', 1409.68, 'poundsterlinglive'),
    ('2025-10-02', 'USD', 1406.02, 'poundsterlinglive'),
    ('2025-10-06', 'USD', 1410.67, 'poundsterlinglive'),
    ('2025-10-10', 'USD', 1429.56, 'poundsterlinglive'),
    ('2025-10-13', 'USD', 1426.50, 'poundsterlinglive'),
    ('2025-10-15', 'USD', 1421.39, 'poundsterlinglive'),
    ('2025-10-22', 'USD', 1432.01, 'poundsterlinglive'),
    ('2025-10-23', 'USD', 1436.82, 'poundsterlinglive'),
    ('2025-10-27', 'USD', 1429.71, 'poundsterlinglive'),
    ('2025-10-28', 'USD', 1431.56, 'poundsterlinglive'),
    ('2025-10-29', 'USD', 1426.26, 'poundsterlinglive'),
    ('2025-10-30', 'USD', 1429.63, 'poundsterlinglive'),
    ('2025-10-31', 'USD', 1429.22, 'poundsterlinglive'),
    ('2025-11-03', 'USD', 1429.96, 'poundsterlinglive'),
    ('2025-11-05', 'USD', 1440.72, 'poundsterlinglive'),
    ('2025-11-06', 'USD', 1448.89, 'poundsterlinglive'),
    ('2025-11-07', 'USD', 1455.99, 'poundsterlinglive'),
    ('2025-11-10', 'USD', 1456.60, 'poundsterlinglive'),
    ('2025-11-11', 'USD', 1460.82, 'poundsterlinglive'),
    ('2025-11-12', 'USD', 1469.37, 'poundsterlinglive'),
    ('2025-11-13', 'USD', 1470.70, 'poundsterlinglive'),
    ('2025-11-14', 'USD', 1449.00, 'poundsterlinglive'),
    ('2025-11-17', 'USD', 1462.26, 'poundsterlinglive'),
    ('2025-11-19', 'USD', 1466.95, 'poundsterlinglive'),
    ('2025-12-05', 'USD', 1473.79, 'poundsterlinglive'),
    ('2025-12-10', 'USD', 1468.10, 'poundsterlinglive'),
    ('2025-12-15', 'USD', 1469.22, 'poundsterlinglive'),
    ('2025-12-19', 'USD', 1475.76, 'poundsterlinglive'),
    ('2025-12-22', 'USD', 1479.47, 'poundsterlinglive'),
    ('2025-12-26', 'USD', 1442.46, 'poundsterlinglive'),
    ('2025-12-29', 'USD', 1435.05, 'poundsterlinglive'),
    ('2025-12-31', 'USD', 1444.55, 'poundsterlinglive'),
    ('2025-04-14', 'USD', 1420.41, 'exchange-rates.org'),
    ('2025-05-02', 'USD', 1399.89, 'exchange-rates.org');
