-- =====================================================================
-- 프래프트 관리회계 앱 — 레거시 데이터 이관 (자동 생성)
-- 생성 스크립트: scripts/generate-legacy-migration.mjs
-- 소스: PRAFT_회계시스템_웹앱.html (ACCOUNTS 기초잔액 + SEED_ENTRIES 72건)
-- 이관: 개시분개 1건 + 거래 66건 (결산대체 6건은 의도적으로 제외 — 04 파일 상단 주석 및
--       계획 문서 참고: 레거시의 반기 가결산 대체는 신규 스키마의 posted-라인 합산 방식과
--       충돌하여 연간 손익을 과소집계하므로 이관하지 않음. 실제 마감은 연말에 closing 분개로.)
-- 검증: 총 차변 = 총 대변 = 194,057,107원 (스크립트 자체 검증 통과)
-- 실행 순서: 01_schema.sql → 02_seed.sql → 03_rls_policies.sql → 04(이 파일)
-- =====================================================================

WITH e_open AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('OPEN-2025', DATE '2025-12-31', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2025), '개시분개 — 제1기(2025) 확정 기말잔액 이관', 'opening', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1096654, 0, 'common' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 66938281, 0, 'invest' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11106'), 1320, 0, 'common' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '21003'), 0, 29000000, 'common' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '21004'), 0, 17283, 'common' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '31000'), 0, 25000000, 'common' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '33001'), 0, 13485958, 'invest' FROM e_open
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '35001'), 0, 533014, 'common' FROM e_open;

WITH e_00001 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00001', DATE '2026-01-01', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '전기 평가익 환입(기초 취득원가 환원)', 'opening', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '33001'), 13485958, 0, 'invest' FROM e_00001
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 13485958, 'invest' FROM e_00001;

WITH e_00002 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00002', DATE '2026-01-18', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 부가가치세 납부', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61001'), 7280, 0, 'common' FROM e_00002
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 7280, 'common' FROM e_00002;

WITH e_00017 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00017', DATE '2026-02-05', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 아메리칸익스프레스 3주 매도*이동평균₩390,558', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1171674, 0, 'common' FROM e_00017
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1171674, 'invest' FROM e_00017;

WITH e_00018 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00018', DATE '2026-02-05', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[알파벳A] 3주*$1019.66*@1451.19', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1479720, 0, 'invest' FROM e_00018
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1479720, 'common' FROM e_00018;

WITH e_00019 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00019', DATE '2026-02-11', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[코인베이스] 1주*$165.69*@1451.19', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 240448, 0, 'invest' FROM e_00019
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 240448, 'common' FROM e_00019;

WITH e_00015 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00015', DATE '2026-02-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 가수금(연계은행 이체입금)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 3000000, 0, 'common' FROM e_00015
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '21003'), 0, 3000000, 'common' FROM e_00015;

WITH e_00016 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00016', DATE '2026-02-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2845-10] 가수금(연계은행 이체입금)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 3000000, 0, 'common' FROM e_00016
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '21003'), 0, 3000000, 'common' FROM e_00016;

WITH e_00003 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00003', DATE '2026-02-23', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[네이버파이낸셜] 스마트스토어정산', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 142581, 0, 'common' FROM e_00003
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '41001'), 0, 142581, 'commerce' FROM e_00003;

WITH e_00004 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00004', DATE '2026-03-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[네이버파이낸셜] 스마트스토어정산', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 142581, 0, 'common' FROM e_00004
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '41001'), 0, 142581, 'commerce' FROM e_00004;

WITH e_00020 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00020', DATE '2026-03-10', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[코인베이스] 10주*$1999.9*@1463.69', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 2927243, 0, 'invest' FROM e_00020
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 2927243, 'common' FROM e_00020;

WITH e_00051 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00051', DATE '2026-03-17', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[미국채권 아이셰어즈ETF] 6주*$595.08*@1468.56', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 873909, 0, 'invest' FROM e_00051
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 873909, 'common' FROM e_00051;

WITH e_00052 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00052', DATE '2026-03-17', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[금 아이셰어즈ETF] 4주*$380.4*@1468.56', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 558639, 0, 'invest' FROM e_00052
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 558639, 'common' FROM e_00052;

WITH e_00053 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00053', DATE '2026-03-17', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[S&P500코어아이셰어즈ETF] 1주*$666.35*@1468.56', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 978573, 0, 'invest' FROM e_00053
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 978573, 'common' FROM e_00053;

WITH e_00021 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00021', DATE '2026-03-18', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 테슬라 10주 매도*이동평균₩431,454', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 4314536, 0, 'common' FROM e_00021
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 4314536, 'invest' FROM e_00021;

WITH e_00022 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00022', DATE '2026-03-18', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[알파벳A] 10주*$3060.6*@1469.25', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 4496793, 0, 'invest' FROM e_00022
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 4496793, 'common' FROM e_00022;

WITH e_00005 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00005', DATE '2026-03-19', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 클로드 구독료(해외카드)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61002'), 30671, 0, 'common' FROM e_00005
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 30671, 'common' FROM e_00005;

WITH e_00006 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00006', DATE '2026-03-24', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 클로드 구독료(해외카드)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61002'), 7620, 0, 'common' FROM e_00006
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 7620, 'common' FROM e_00006;

WITH e_00007 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00007', DATE '2026-03-31', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 국세 납부', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61001'), 46770, 0, 'common' FROM e_00007
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 46770, 'common' FROM e_00007;

WITH e_00008 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00008', DATE '2026-03-31', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 평택송탄 지방세 등', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61001'), 4670, 0, 'common' FROM e_00008
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 4670, 'common' FROM e_00008;

WITH e_00009 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00009', DATE '2026-04-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[박병욱] 박병욱 가수금 입금', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1000000, 0, 'common' FROM e_00009
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '21003'), 0, 1000000, 'common' FROM e_00009;

WITH e_00010 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00010', DATE '2026-04-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 법원행정처 등록면허세 등', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61001'), 1000, 0, 'common' FROM e_00010
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1000, 'common' FROM e_00010;

WITH e_00011 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00011', DATE '2026-04-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[세무법인상록] 세무법인상록 기장수수료', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61002'), 1100000, 0, 'common' FROM e_00011
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1100000, 'common' FROM e_00011;

WITH e_00054 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00054', DATE '2026-04-23', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2845-10] 미국채권 아이셰어즈ETF 20주 매도*이동평균₩140,785', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 2815696, 0, 'common' FROM e_00054
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 2815696, 'invest' FROM e_00054;

WITH e_00055 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00055', DATE '2026-04-23', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[금 아이셰어즈ETF] 4주*$359.8*@1494.26', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 537635, 0, 'invest' FROM e_00055
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 537635, 'common' FROM e_00055;

WITH e_00056 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00056', DATE '2026-04-23', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[나스닥100 인베스코ETF] 5주*$1337.35*@1494.26', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1998350, 0, 'invest' FROM e_00056
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1998350, 'common' FROM e_00056;

WITH e_00012 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00012', DATE '2026-05-07', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[네이버파이낸셜] 스마트스토어정산', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 332686, 0, 'common' FROM e_00012
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '41001'), 0, 332686, 'commerce' FROM e_00012;

WITH e_00023 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00023', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 테슬라 30주 매도*이동평균₩431,454', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 12943609, 0, 'common' FROM e_00023
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 12943609, 'invest' FROM e_00023;

WITH e_00024 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00024', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[아이온큐] 30주*$1696.2*@1508.15', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 2558132, 0, 'invest' FROM e_00024
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 2558132, 'common' FROM e_00024;

WITH e_00025 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00025', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[미국반도체3배디렉시온ETF] 10주*$1833.1*@1508.15', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 2764599, 0, 'invest' FROM e_00025
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 2764599, 'common' FROM e_00025;

WITH e_00057 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00057', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2845-10] 미국채권 아이셰어즈ETF 10주 매도*이동평균₩140,785', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1407848, 0, 'common' FROM e_00057
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1407848, 'invest' FROM e_00057;

WITH e_00058 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00058', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2845-10] 미국채권 아이셰어즈ETF 10주 매도*이동평균₩140,785', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1407848, 0, 'common' FROM e_00058
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1407848, 'invest' FROM e_00058;

WITH e_00059 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00059', DATE '2026-05-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[QQQ레버리지3배프로셰어즈ETF] 15주*$1148.25*@1508.15', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1731739, 0, 'invest' FROM e_00059
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1731739, 'common' FROM e_00059;

WITH e_00026 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00026', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[코인베이스] 1주*$188.03*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 284493, 0, 'invest' FROM e_00026
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 284493, 'common' FROM e_00026;

WITH e_00027 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00027', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[아이온큐] 5주*$243.45*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 368344, 0, 'invest' FROM e_00027
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 368344, 'common' FROM e_00027;

WITH e_00028 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00028', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[아이온큐] 5주*$243.95*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 369101, 0, 'invest' FROM e_00028
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 369101, 'common' FROM e_00028;

WITH e_00029 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00029', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[미국반도체3배디렉시온ETF] 5주*$761.95*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1152844, 0, 'invest' FROM e_00029
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1152844, 'common' FROM e_00029;

WITH e_00030 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00030', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$340.24*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 514789, 0, 'invest' FROM e_00030
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 514789, 'common' FROM e_00030;

WITH e_00060 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00060', DATE '2026-05-20', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[나스닥100 인베스코ETF] 1주*$290.09*@1513.02', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 438911, 0, 'invest' FROM e_00060
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 438911, 'common' FROM e_00060;

WITH e_00031 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00031', DATE '2026-05-27', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[알파벳A] 1주*$383.63*@1517.88', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 582304, 0, 'invest' FROM e_00031
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 582304, 'common' FROM e_00031;

WITH e_00032 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00032', DATE '2026-05-27', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[알파벳A] 1주*$387.2*@1517.88', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 587723, 0, 'invest' FROM e_00032
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 587723, 'common' FROM e_00032;

WITH e_00033 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00033', DATE '2026-06-02', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 3주*$852.72*@1522.05', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1297881, 0, 'invest' FROM e_00033
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1297881, 'common' FROM e_00033;

WITH e_00034 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00034', DATE '2026-06-02', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$312.74*@1522.05', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 476005, 0, 'invest' FROM e_00034
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 476005, 'common' FROM e_00034;

WITH e_00035 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00035', DATE '2026-06-02', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$314.3*@1522.05', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 478380, 0, 'invest' FROM e_00035
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 478380, 'common' FROM e_00035;

WITH e_00036 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00036', DATE '2026-06-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 아이온큐 20주 매도*이동평균₩82,389', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1647788, 0, 'common' FROM e_00036
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1647788, 'invest' FROM e_00036;

WITH e_00037 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00037', DATE '2026-06-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 미국반도체3배디렉시온ETF 15주 매도*이동평균₩261,163', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 3917443, 0, 'common' FROM e_00037
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 3917443, 'invest' FROM e_00037;

WITH e_00038 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00038', DATE '2026-06-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 3주*$974.04*@1522.74', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1483213, 0, 'invest' FROM e_00038
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1483213, 'common' FROM e_00038;

WITH e_00061 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00061', DATE '2026-06-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2845-10] QQQ레버리지3배프로셰어즈ETF 15주 매도*이동평균₩115,449', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1731739, 0, 'common' FROM e_00061
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1731739, 'invest' FROM e_00061;

WITH e_00062 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00062', DATE '2026-06-03', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[나스닥100 인베스코ETF] 1주*$304.72*@1522.74', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 464010, 0, 'invest' FROM e_00062
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 464010, 'common' FROM e_00062;

WITH e_00039 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00039', DATE '2026-06-10', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 2주*$563.07*@1527.61', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 860149, 0, 'invest' FROM e_00039
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 860149, 'common' FROM e_00039;

WITH e_00040 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00040', DATE '2026-06-10', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$302.72*@1527.61', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 462437, 0, 'invest' FROM e_00040
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 462437, 'common' FROM e_00040;

WITH e_00013 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00013', DATE '2026-06-11', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 클로드 구독료(해외카드,대량결제)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61002'), 313065, 0, 'common' FROM e_00013
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 313065, 'common' FROM e_00013;

WITH e_00041 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00041', DATE '2026-06-12', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 1주*$274.41*@1529.00', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 419572, 0, 'invest' FROM e_00041
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 419572, 'common' FROM e_00041;

WITH e_00042 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00042', DATE '2026-06-12', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$277.35*@1529.00', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 424067, 0, 'invest' FROM e_00042
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 424067, 'common' FROM e_00042;

WITH e_00014 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00014', DATE '2026-06-13', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[KB국민은행754100] 결산이자', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 372, 0, 'common' FROM e_00014
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '71001'), 0, 372, 'common' FROM e_00014;

WITH e_00043 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00043', DATE '2026-06-17', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 코인베이스 5주 매도*이동평균₩354,811', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 1774055, 0, 'common' FROM e_00043
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 1774055, 'invest' FROM e_00043;

WITH e_00044 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00044', DATE '2026-06-17', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 1주*$265.63*@1532.47', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 407070, 0, 'invest' FROM e_00044
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 407070, 'common' FROM e_00044;

WITH e_00045 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00045', DATE '2026-06-24', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권2843-10] 코인베이스 16주 매도*이동평균₩354,811', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 5676974, 0, 'common' FROM e_00045
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 0, 5676974, 'invest' FROM e_00045;

WITH e_00046 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00046', DATE '2026-06-24', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[알파벳A] 2주*$689.22*@1537.33', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1059560, 0, 'invest' FROM e_00046
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1059560, 'common' FROM e_00046;

WITH e_00047 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00047', DATE '2026-06-24', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[IBM] 3주*$738.78*@1537.33', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 1135750, 0, 'invest' FROM e_00047
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 1135750, 'common' FROM e_00047;

WITH e_00048 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00048', DATE '2026-06-24', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[마벨테크놀로지그룹] 2주*$611.25*@1537.33', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 939694, 0, 'invest' FROM e_00048
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 939694, 'common' FROM e_00048;

WITH e_00049 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00049', DATE '2026-06-25', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[마벨테크놀로지그룹] 2주*$562.0*@1538.03', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 864371, 0, 'invest' FROM e_00049
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 864371, 'common' FROM e_00049;

WITH e_00050 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00050', DATE '2026-06-25', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[버티브홀딩스] 1주*$320.6*@1538.03', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 493091, 0, 'invest' FROM e_00050
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 493091, 'common' FROM e_00050;

WITH e_00063 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00063', DATE '2026-06-30', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권] 예탁금이용료(이자)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 5982, 0, 'common' FROM e_00063
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '71001'), 0, 5982, 'common' FROM e_00063;

WITH e_00064 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00064', DATE '2026-06-30', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권] 매도수수료', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '61002'), 60643, 0, 'common' FROM e_00064
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 0, 60643, 'common' FROM e_00064;

WITH e_00065 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00065', DATE '2026-06-30', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '[키움증권] 매도실현손익 및 배당금수익(순)', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11101'), 8900983, 0, 'common' FROM e_00065
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '41002'), 0, 8900983, 'invest' FROM e_00065;

WITH e_00066 AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES ('00066', DATE '2026-06-30', (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2026), '평가이익', 'manual', 'posted', now())
  RETURNING entry_id
)
INSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '11104'), 18919241, 0, 'invest' FROM e_00066
UNION ALL
SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = '33001'), 0, 18919241, 'invest' FROM e_00066;
