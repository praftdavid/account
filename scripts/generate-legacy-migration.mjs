// 1회성 스크립트: 레거시 단일파일 웹앱(PRAFT_회계시스템_웹앱.html)의
// ACCOUNTS(기초잔액) + SEED_ENTRIES(2026년 실거래 72건)를
// 신규 스키마(journal_entries/journal_lines)에 맞는 SQL로 변환해
// db/04_migrate_legacy_data.sql 로 출력한다.
//
// 실행: node scripts/generate-legacy-migration.mjs
// (DB에 직접 연결하지 않음 — 결과 SQL 파일을 Supabase SQL Editor에서 검토 후 실행)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'db', '04_migrate_legacy_data.sql');

// 계정명 -> account_code (db/02_seed.sql 기준)
const ACCOUNT_CODE = {
  '보통예금': '11101', '외상매출금': '11102', '매도가능증권': '11104', '부가세대급금': '11105',
  '선납세금': '11106', '상품': '11201',
  '미지급금': '21001', '부가세예수금': '21002', '가수금': '21003', '미지급세금': '21004',
  '자본금': '31000', '매도가능증권평가익': '33001', '미처분이익잉여금': '35001',
  '상품매출': '41001', '금융매출': '41002',
  '상품매출원가': '51001',
  '세금과공과금': '61001', '지급수수료': '61002',
  '이자수익': '71001', '외환차익': '71002', '잡이익': '71003',
  '외환차손': '81001', '잡손실': '81002',
  '법인세등': '91001',
};

// 계정명 -> segment (praft_accounting_app_design.md §7 대표 부문표)
const SEGMENT = {
  '매도가능증권': 'invest', '매도가능증권평가익': 'invest', '금융매출': 'invest',
  '상품매출': 'commerce', '상품매출원가': 'commerce', '외상매출금': 'commerce', '상품': 'commerce',
};
const segOf = (name) => SEGMENT[name] || 'common';

// 레거시 ACCOUNTS 배열의 기초잔액(=2025기말=2026기초). 손익 계정은 기초 0이므로 제외.
// 레거시의 이월이익잉여금(533,014) + 미처분이익잉여금(0)은 신규 스키마에 계정이
// 하나(35001 미처분이익잉여금)뿐이므로 합산해서 이관.
const OPENING_LINES = [
  { name: '보통예금', side: 'DR', amt: 1096654 },
  { name: '매도가능증권', side: 'DR', amt: 66938281 },
  { name: '선납세금', side: 'DR', amt: 1320 },
  { name: '가수금', side: 'CR', amt: 29000000 },
  { name: '미지급세금', side: 'CR', amt: 17283 },
  { name: '자본금', side: 'CR', amt: 25000000 },
  { name: '매도가능증권평가익', side: 'CR', amt: 13485958 },
  { name: '미처분이익잉여금', side: 'CR', amt: 533014 },
];

// 레거시 SEED_ENTRIES 그대로 (praft_회계시스템_웹앱.html)
const SEED_ENTRIES = [{"date": "2026-01-01", "no": "00001", "type": "일반", "dr": "매도가능증권평가익", "drAmt": 13485958, "cr": "매도가능증권", "crAmt": 13485958, "party": "", "memo": "전기 평가익 환입(기초 취득원가 환원)"}, {"date": "2026-01-18", "no": "00002", "type": "일반", "dr": "세금과공과금", "drAmt": 7280, "cr": "보통예금", "crAmt": 7280, "party": "KB국민은행754100", "memo": "부가가치세 납부"}, {"date": "2026-02-05", "no": "00017", "type": "일반", "dr": "보통예금", "drAmt": 1171674, "cr": "매도가능증권", "crAmt": 1171674, "party": "키움증권2843-10", "memo": "아메리칸익스프레스 3주 매도*이동평균₩390,558"}, {"date": "2026-02-05", "no": "00018", "type": "일반", "dr": "매도가능증권", "drAmt": 1479720, "cr": "보통예금", "crAmt": 1479720, "party": "알파벳A", "memo": "3주*$1019.66*@1451.19"}, {"date": "2026-02-11", "no": "00019", "type": "일반", "dr": "매도가능증권", "drAmt": 240448, "cr": "보통예금", "crAmt": 240448, "party": "코인베이스", "memo": "1주*$165.69*@1451.19"}, {"date": "2026-02-20", "no": "00015", "type": "일반", "dr": "보통예금", "drAmt": 3000000, "cr": "가수금", "crAmt": 3000000, "party": "키움증권2843-10", "memo": "가수금(연계은행 이체입금)"}, {"date": "2026-02-20", "no": "00016", "type": "일반", "dr": "보통예금", "drAmt": 3000000, "cr": "가수금", "crAmt": 3000000, "party": "키움증권2845-10", "memo": "가수금(연계은행 이체입금)"}, {"date": "2026-02-23", "no": "00003", "type": "일반", "dr": "보통예금", "drAmt": 142581, "cr": "상품매출", "crAmt": 142581, "party": "네이버파이낸셜", "memo": "스마트스토어정산"}, {"date": "2026-03-03", "no": "00004", "type": "일반", "dr": "보통예금", "drAmt": 142581, "cr": "상품매출", "crAmt": 142581, "party": "네이버파이낸셜", "memo": "스마트스토어정산"}, {"date": "2026-03-10", "no": "00020", "type": "일반", "dr": "매도가능증권", "drAmt": 2927243, "cr": "보통예금", "crAmt": 2927243, "party": "코인베이스", "memo": "10주*$1999.9*@1463.69"}, {"date": "2026-03-17", "no": "00051", "type": "일반", "dr": "매도가능증권", "drAmt": 873909, "cr": "보통예금", "crAmt": 873909, "party": "미국채권 아이셰어즈ETF", "memo": "6주*$595.08*@1468.56"}, {"date": "2026-03-17", "no": "00052", "type": "일반", "dr": "매도가능증권", "drAmt": 558639, "cr": "보통예금", "crAmt": 558639, "party": "금 아이셰어즈ETF", "memo": "4주*$380.4*@1468.56"}, {"date": "2026-03-17", "no": "00053", "type": "일반", "dr": "매도가능증권", "drAmt": 978573, "cr": "보통예금", "crAmt": 978573, "party": "S&P500코어아이셰어즈ETF", "memo": "1주*$666.35*@1468.56"}, {"date": "2026-03-18", "no": "00021", "type": "일반", "dr": "보통예금", "drAmt": 4314536, "cr": "매도가능증권", "crAmt": 4314536, "party": "키움증권2843-10", "memo": "테슬라 10주 매도*이동평균₩431,454"}, {"date": "2026-03-18", "no": "00022", "type": "일반", "dr": "매도가능증권", "drAmt": 4496793, "cr": "보통예금", "crAmt": 4496793, "party": "알파벳A", "memo": "10주*$3060.6*@1469.25"}, {"date": "2026-03-19", "no": "00005", "type": "일반", "dr": "지급수수료", "drAmt": 30671, "cr": "보통예금", "crAmt": 30671, "party": "KB국민은행754100", "memo": "클로드 구독료(해외카드)"}, {"date": "2026-03-24", "no": "00006", "type": "일반", "dr": "지급수수료", "drAmt": 7620, "cr": "보통예금", "crAmt": 7620, "party": "KB국민은행754100", "memo": "클로드 구독료(해외카드)"}, {"date": "2026-03-31", "no": "00007", "type": "일반", "dr": "세금과공과금", "drAmt": 46770, "cr": "보통예금", "crAmt": 46770, "party": "KB국민은행754100", "memo": "국세 납부"}, {"date": "2026-03-31", "no": "00008", "type": "일반", "dr": "세금과공과금", "drAmt": 4670, "cr": "보통예금", "crAmt": 4670, "party": "KB국민은행754100", "memo": "평택송탄 지방세 등"}, {"date": "2026-04-03", "no": "00009", "type": "일반", "dr": "보통예금", "drAmt": 1000000, "cr": "가수금", "crAmt": 1000000, "party": "박병욱", "memo": "박병욱 가수금 입금"}, {"date": "2026-04-03", "no": "00010", "type": "일반", "dr": "세금과공과금", "drAmt": 1000, "cr": "보통예금", "crAmt": 1000, "party": "KB국민은행754100", "memo": "법원행정처 등록면허세 등"}, {"date": "2026-04-03", "no": "00011", "type": "일반", "dr": "지급수수료", "drAmt": 1100000, "cr": "보통예금", "crAmt": 1100000, "party": "세무법인상록", "memo": "세무법인상록 기장수수료"}, {"date": "2026-04-23", "no": "00054", "type": "일반", "dr": "보통예금", "drAmt": 2815696, "cr": "매도가능증권", "crAmt": 2815696, "party": "키움증권2845-10", "memo": "미국채권 아이셰어즈ETF 20주 매도*이동평균₩140,785"}, {"date": "2026-04-23", "no": "00055", "type": "일반", "dr": "매도가능증권", "drAmt": 537635, "cr": "보통예금", "crAmt": 537635, "party": "금 아이셰어즈ETF", "memo": "4주*$359.8*@1494.26"}, {"date": "2026-04-23", "no": "00056", "type": "일반", "dr": "매도가능증권", "drAmt": 1998350, "cr": "보통예금", "crAmt": 1998350, "party": "나스닥100 인베스코ETF", "memo": "5주*$1337.35*@1494.26"}, {"date": "2026-05-07", "no": "00012", "type": "일반", "dr": "보통예금", "drAmt": 332686, "cr": "상품매출", "crAmt": 332686, "party": "네이버파이낸셜", "memo": "스마트스토어정산"}, {"date": "2026-05-13", "no": "00023", "type": "일반", "dr": "보통예금", "drAmt": 12943609, "cr": "매도가능증권", "crAmt": 12943609, "party": "키움증권2843-10", "memo": "테슬라 30주 매도*이동평균₩431,454"}, {"date": "2026-05-13", "no": "00024", "type": "일반", "dr": "매도가능증권", "drAmt": 2558132, "cr": "보통예금", "crAmt": 2558132, "party": "아이온큐", "memo": "30주*$1696.2*@1508.15"}, {"date": "2026-05-13", "no": "00025", "type": "일반", "dr": "매도가능증권", "drAmt": 2764599, "cr": "보통예금", "crAmt": 2764599, "party": "미국반도체3배디렉시온ETF", "memo": "10주*$1833.1*@1508.15"}, {"date": "2026-05-13", "no": "00057", "type": "일반", "dr": "보통예금", "drAmt": 1407848, "cr": "매도가능증권", "crAmt": 1407848, "party": "키움증권2845-10", "memo": "미국채권 아이셰어즈ETF 10주 매도*이동평균₩140,785"}, {"date": "2026-05-13", "no": "00058", "type": "일반", "dr": "보통예금", "drAmt": 1407848, "cr": "매도가능증권", "crAmt": 1407848, "party": "키움증권2845-10", "memo": "미국채권 아이셰어즈ETF 10주 매도*이동평균₩140,785"}, {"date": "2026-05-13", "no": "00059", "type": "일반", "dr": "매도가능증권", "drAmt": 1731739, "cr": "보통예금", "crAmt": 1731739, "party": "QQQ레버리지3배프로셰어즈ETF", "memo": "15주*$1148.25*@1508.15"}, {"date": "2026-05-20", "no": "00026", "type": "일반", "dr": "매도가능증권", "drAmt": 284493, "cr": "보통예금", "crAmt": 284493, "party": "코인베이스", "memo": "1주*$188.03*@1513.02"}, {"date": "2026-05-20", "no": "00027", "type": "일반", "dr": "매도가능증권", "drAmt": 368344, "cr": "보통예금", "crAmt": 368344, "party": "아이온큐", "memo": "5주*$243.45*@1513.02"}, {"date": "2026-05-20", "no": "00028", "type": "일반", "dr": "매도가능증권", "drAmt": 369101, "cr": "보통예금", "crAmt": 369101, "party": "아이온큐", "memo": "5주*$243.95*@1513.02"}, {"date": "2026-05-20", "no": "00029", "type": "일반", "dr": "매도가능증권", "drAmt": 1152844, "cr": "보통예금", "crAmt": 1152844, "party": "미국반도체3배디렉시온ETF", "memo": "5주*$761.95*@1513.02"}, {"date": "2026-05-20", "no": "00030", "type": "일반", "dr": "매도가능증권", "drAmt": 514789, "cr": "보통예금", "crAmt": 514789, "party": "버티브홀딩스", "memo": "1주*$340.24*@1513.02"}, {"date": "2026-05-20", "no": "00060", "type": "일반", "dr": "매도가능증권", "drAmt": 438911, "cr": "보통예금", "crAmt": 438911, "party": "나스닥100 인베스코ETF", "memo": "1주*$290.09*@1513.02"}, {"date": "2026-05-27", "no": "00031", "type": "일반", "dr": "매도가능증권", "drAmt": 582304, "cr": "보통예금", "crAmt": 582304, "party": "알파벳A", "memo": "1주*$383.63*@1517.88"}, {"date": "2026-05-27", "no": "00032", "type": "일반", "dr": "매도가능증권", "drAmt": 587723, "cr": "보통예금", "crAmt": 587723, "party": "알파벳A", "memo": "1주*$387.2*@1517.88"}, {"date": "2026-06-02", "no": "00033", "type": "일반", "dr": "매도가능증권", "drAmt": 1297881, "cr": "보통예금", "crAmt": 1297881, "party": "IBM", "memo": "3주*$852.72*@1522.05"}, {"date": "2026-06-02", "no": "00034", "type": "일반", "dr": "매도가능증권", "drAmt": 476005, "cr": "보통예금", "crAmt": 476005, "party": "버티브홀딩스", "memo": "1주*$312.74*@1522.05"}, {"date": "2026-06-02", "no": "00035", "type": "일반", "dr": "매도가능증권", "drAmt": 478380, "cr": "보통예금", "crAmt": 478380, "party": "버티브홀딩스", "memo": "1주*$314.3*@1522.05"}, {"date": "2026-06-03", "no": "00036", "type": "일반", "dr": "보통예금", "drAmt": 1647788, "cr": "매도가능증권", "crAmt": 1647788, "party": "키움증권2843-10", "memo": "아이온큐 20주 매도*이동평균₩82,389"}, {"date": "2026-06-03", "no": "00037", "type": "일반", "dr": "보통예금", "drAmt": 3917443, "cr": "매도가능증권", "crAmt": 3917443, "party": "키움증권2843-10", "memo": "미국반도체3배디렉시온ETF 15주 매도*이동평균₩261,163"}, {"date": "2026-06-03", "no": "00038", "type": "일반", "dr": "매도가능증권", "drAmt": 1483213, "cr": "보통예금", "crAmt": 1483213, "party": "IBM", "memo": "3주*$974.04*@1522.74"}, {"date": "2026-06-03", "no": "00061", "type": "일반", "dr": "보통예금", "drAmt": 1731739, "cr": "매도가능증권", "crAmt": 1731739, "party": "키움증권2845-10", "memo": "QQQ레버리지3배프로셰어즈ETF 15주 매도*이동평균₩115,449"}, {"date": "2026-06-03", "no": "00062", "type": "일반", "dr": "매도가능증권", "drAmt": 464010, "cr": "보통예금", "crAmt": 464010, "party": "나스닥100 인베스코ETF", "memo": "1주*$304.72*@1522.74"}, {"date": "2026-06-10", "no": "00039", "type": "일반", "dr": "매도가능증권", "drAmt": 860149, "cr": "보통예금", "crAmt": 860149, "party": "IBM", "memo": "2주*$563.07*@1527.61"}, {"date": "2026-06-10", "no": "00040", "type": "일반", "dr": "매도가능증권", "drAmt": 462437, "cr": "보통예금", "crAmt": 462437, "party": "버티브홀딩스", "memo": "1주*$302.72*@1527.61"}, {"date": "2026-06-11", "no": "00013", "type": "일반", "dr": "지급수수료", "drAmt": 313065, "cr": "보통예금", "crAmt": 313065, "party": "KB국민은행754100", "memo": "클로드 구독료(해외카드,대량결제)"}, {"date": "2026-06-12", "no": "00041", "type": "일반", "dr": "매도가능증권", "drAmt": 419572, "cr": "보통예금", "crAmt": 419572, "party": "IBM", "memo": "1주*$274.41*@1529.00"}, {"date": "2026-06-12", "no": "00042", "type": "일반", "dr": "매도가능증권", "drAmt": 424067, "cr": "보통예금", "crAmt": 424067, "party": "버티브홀딩스", "memo": "1주*$277.35*@1529.00"}, {"date": "2026-06-13", "no": "00014", "type": "일반", "dr": "보통예금", "drAmt": 372, "cr": "이자수익", "crAmt": 372, "party": "KB국민은행754100", "memo": "결산이자"}, {"date": "2026-06-17", "no": "00043", "type": "일반", "dr": "보통예금", "drAmt": 1774055, "cr": "매도가능증권", "crAmt": 1774055, "party": "키움증권2843-10", "memo": "코인베이스 5주 매도*이동평균₩354,811"}, {"date": "2026-06-17", "no": "00044", "type": "일반", "dr": "매도가능증권", "drAmt": 407070, "cr": "보통예금", "crAmt": 407070, "party": "IBM", "memo": "1주*$265.63*@1532.47"}, {"date": "2026-06-24", "no": "00045", "type": "일반", "dr": "보통예금", "drAmt": 5676974, "cr": "매도가능증권", "crAmt": 5676974, "party": "키움증권2843-10", "memo": "코인베이스 16주 매도*이동평균₩354,811"}, {"date": "2026-06-24", "no": "00046", "type": "일반", "dr": "매도가능증권", "drAmt": 1059560, "cr": "보통예금", "crAmt": 1059560, "party": "알파벳A", "memo": "2주*$689.22*@1537.33"}, {"date": "2026-06-24", "no": "00047", "type": "일반", "dr": "매도가능증권", "drAmt": 1135750, "cr": "보통예금", "crAmt": 1135750, "party": "IBM", "memo": "3주*$738.78*@1537.33"}, {"date": "2026-06-24", "no": "00048", "type": "일반", "dr": "매도가능증권", "drAmt": 939694, "cr": "보통예금", "crAmt": 939694, "party": "마벨테크놀로지그룹", "memo": "2주*$611.25*@1537.33"}, {"date": "2026-06-25", "no": "00049", "type": "일반", "dr": "매도가능증권", "drAmt": 864371, "cr": "보통예금", "crAmt": 864371, "party": "마벨테크놀로지그룹", "memo": "2주*$562.0*@1538.03"}, {"date": "2026-06-25", "no": "00050", "type": "일반", "dr": "매도가능증권", "drAmt": 493091, "cr": "보통예금", "crAmt": 493091, "party": "버티브홀딩스", "memo": "1주*$320.6*@1538.03"}, {"date": "2026-06-30", "no": "00063", "type": "일반", "dr": "보통예금", "drAmt": 5982, "cr": "이자수익", "crAmt": 5982, "party": "키움증권", "memo": "예탁금이용료(이자)"}, {"date": "2026-06-30", "no": "00064", "type": "일반", "dr": "지급수수료", "drAmt": 60643, "cr": "보통예금", "crAmt": 60643, "party": "키움증권", "memo": "매도수수료"}, {"date": "2026-06-30", "no": "00065", "type": "일반", "dr": "보통예금", "drAmt": 8900983, "cr": "금융매출", "crAmt": 8900983, "party": "키움증권", "memo": "매도실현손익 및 배당금수익(순)"}, {"date": "2026-06-30", "no": "00066", "type": "일반", "dr": "매도가능증권", "drAmt": 18919241, "cr": "매도가능증권평가익", "crAmt": 18919241, "party": "", "memo": "평가이익"}, {"date": "2026-06-30", "no": "00067", "type": "결산대체", "dr": "상품매출", "drAmt": 617848, "cr": "손익", "crAmt": 617848, "party": "", "memo": "수익에서 대체"}, {"date": "2026-06-30", "no": "00068", "type": "결산대체", "dr": "금융매출", "drAmt": 8900983, "cr": "손익", "crAmt": 8900983, "party": "", "memo": "수익에서 대체"}, {"date": "2026-06-30", "no": "00069", "type": "결산대체", "dr": "이자수익", "drAmt": 6354, "cr": "손익", "crAmt": 6354, "party": "", "memo": "수익에서 대체"}, {"date": "2026-06-30", "no": "00070", "type": "결산대체", "dr": "손익", "drAmt": 59720, "cr": "세금과공과금", "crAmt": 59720, "party": "", "memo": "비용에서 대체"}, {"date": "2026-06-30", "no": "00071", "type": "결산대체", "dr": "손익", "drAmt": 1511999, "cr": "지급수수료", "crAmt": 1511999, "party": "", "memo": "비용에서 대체"}, {"date": "2026-06-30", "no": "00072", "type": "결산대체", "dr": "손익", "drAmt": 7953466, "cr": "미처분이익잉여금", "crAmt": 7953466, "party": "", "memo": "당기순손익 잉여금에 대체"}];

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function periodExpr(dateStr) {
  const year = dateStr.slice(0, 4);
  return `(SELECT period_id FROM fiscal_periods WHERE fiscal_year = ${year})`;
}

function entryBlock({ key, entry_no, entry_date, description, source_type, lines }) {
  const header = `WITH e_${key} AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES (${sqlStr(entry_no)}, DATE ${sqlStr(entry_date)}, ${periodExpr(entry_date)}, ${sqlStr(description)}, ${sqlStr(source_type)}, 'posted', now())
  RETURNING entry_id
)`;
  const selects = lines.map((l) => {
    const dr = l.side === 'DR' ? l.amt : 0;
    const cr = l.side === 'CR' ? l.amt : 0;
    const code = ACCOUNT_CODE[l.name];
    if (!code) throw new Error(`계정 매핑 없음: ${l.name}`);
    return `SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = ${sqlStr(code)}), ${dr}, ${cr}, ${sqlStr(segOf(l.name))} FROM e_${key}`;
  });
  return `${header}\nINSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)\n${selects.join('\nUNION ALL\n')};\n`;
}

const blocks = [];
let totalDr = 0;
let totalCr = 0;

// 1) 개시분개
blocks.push(
  entryBlock({
    key: 'open',
    entry_no: 'OPEN-2025',
    entry_date: '2025-12-31',
    description: '개시분개 — 제1기(2025) 확정 기말잔액 이관',
    source_type: 'opening',
    lines: OPENING_LINES,
  })
);
OPENING_LINES.forEach((l) => { if (l.side === 'DR') totalDr += l.amt; else totalCr += l.amt; });

// 2) 레거시 SEED_ENTRIES 이관 (결산대체 6건 제외, 00001은 opening으로 태깅)
let migrated = 0, skipped = 0;
for (const e of SEED_ENTRIES) {
  if (e.type === '결산대체') { skipped++; continue; }
  const source_type = e.no === '00001' ? 'opening' : 'manual';
  const description = e.party ? `[${e.party}] ${e.memo}` : e.memo;
  blocks.push(
    entryBlock({
      key: e.no,
      entry_no: e.no,
      entry_date: e.date,
      description,
      source_type,
      lines: [
        { name: e.dr, side: 'DR', amt: e.drAmt },
        { name: e.cr, side: 'CR', amt: e.crAmt },
      ],
    })
  );
  totalDr += e.drAmt;
  totalCr += e.crAmt;
  migrated++;
}

if (totalDr !== totalCr) {
  console.error(`⚠ 차대 불일치: 차변 ${totalDr.toLocaleString()} / 대변 ${totalCr.toLocaleString()}`);
  process.exit(1);
}

const header = `-- =====================================================================
-- 프래프트 관리회계 앱 — 레거시 데이터 이관 (자동 생성)
-- 생성 스크립트: scripts/generate-legacy-migration.mjs
-- 소스: PRAFT_회계시스템_웹앱.html (ACCOUNTS 기초잔액 + SEED_ENTRIES ${SEED_ENTRIES.length}건)
-- 이관: 개시분개 1건 + 거래 ${migrated}건 (결산대체 ${skipped}건은 의도적으로 제외 — 04 파일 상단 주석 및
--       계획 문서 참고: 레거시의 반기 가결산 대체는 신규 스키마의 posted-라인 합산 방식과
--       충돌하여 연간 손익을 과소집계하므로 이관하지 않음. 실제 마감은 연말에 closing 분개로.)
-- 검증: 총 차변 = 총 대변 = ${totalDr.toLocaleString()}원 (스크립트 자체 검증 통과)
-- 실행 순서: 01_schema.sql → 02_seed.sql → 03_rls_policies.sql → 04(이 파일)
-- =====================================================================

`;

writeFileSync(OUT_PATH, header + blocks.join('\n'), 'utf8');
console.log(`생성 완료: ${OUT_PATH}`);
console.log(`개시분개 1건 + 이관 ${migrated}건 (제외 ${skipped}건), 총액 ${totalDr.toLocaleString()}원 (차대 일치 확인됨)`);
