-- 2026년 상반기 개별 매도일 USD/KRW 환율 (출처: Yahoo Finance KRW=X 일별 종가).
-- 2026년 2~6월 중 특정 며칠(개별 매도 거래일)만 필요해서 월 전체가 아니라 해당 날짜만 채운다.
-- 아래 13_fix_2026h1_sell_gainloss.sql이 이 환율로 실현손익을 재계산해 정정한다.
INSERT INTO fx_rates (rate_date, currency, rate, source) VALUES
    ('2026-02-05', 'USD', 1460.11, 'Yahoo Finance(KRW=X)'),
    ('2026-03-18', 'USD', 1484.87, 'Yahoo Finance(KRW=X)'),
    ('2026-05-13', 'USD', 1489.84, 'Yahoo Finance(KRW=X)'),
    ('2026-06-03', 'USD', 1533.07, 'Yahoo Finance(KRW=X)'),
    ('2026-06-17', 'USD', 1537.56, 'Yahoo Finance(KRW=X)'),
    ('2026-06-24', 'USD', 1546.48, 'Yahoo Finance(KRW=X)')
ON CONFLICT (rate_date, currency) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source;
