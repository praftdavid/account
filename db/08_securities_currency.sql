-- 국내 상장 종목(ETF 등)은 원화로 직접 거래되어 unit_price_usd/fee_usd 컬럼에 원화 값을 그대로 담는다.
-- fx_rate=1로 처리하기 위한 통화 구분 컬럼 추가.
ALTER TABLE securities_transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KRW'));
