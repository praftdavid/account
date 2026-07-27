-- 2026년 7월 영업일 USD/KRW 환율 (출처: valutafx.com 일별 조회).
-- fx_rates에 해당 월 데이터가 없으면 findFxRate()가 null을 반환해 "환율 미확보"로 분개 생성이 막히므로,
-- 새 달의 거래를 올리기 전에 이런 파일을 하나씩 추가하는 것이 정상 운영 절차다(db/README_fx_rates.md 참조).
INSERT INTO fx_rates (rate_date, currency, rate, source) VALUES
    ('2026-07-01', 'USD', 1552.90, 'valutafx'),
    ('2026-07-02', 'USD', 1537.20, 'valutafx'),
    ('2026-07-03', 'USD', 1529.20, 'valutafx'),
    ('2026-07-06', 'USD', 1530.00, 'valutafx'),
    ('2026-07-07', 'USD', 1514.90, 'valutafx'),
    ('2026-07-08', 'USD', 1507.80, 'valutafx'),
    ('2026-07-09', 'USD', 1506.70, 'valutafx'),
    ('2026-07-10', 'USD', 1499.10, 'valutafx'),
    ('2026-07-13', 'USD', 1494.90, 'valutafx'),
    ('2026-07-14', 'USD', 1488.90, 'valutafx'),
    ('2026-07-15', 'USD', 1487.20, 'valutafx'),
    ('2026-07-16', 'USD', 1478.20, 'valutafx'),
    ('2026-07-17', 'USD', 1487.80, 'valutafx'),
    ('2026-07-20', 'USD', 1475.50, 'valutafx'),
    ('2026-07-21', 'USD', 1480.70, 'valutafx'),
    ('2026-07-22', 'USD', 1476.70, 'valutafx'),
    ('2026-07-23', 'USD', 1474.40, 'valutafx'),
    ('2026-07-24', 'USD', 1459.50, 'valutafx')
ON CONFLICT (rate_date, currency) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source;
