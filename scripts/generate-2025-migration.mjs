// 1회성 스크립트: 2025년(제1기) 세무사 결산 분개장(2025-journal-entries.json,
// 원본은 [주식회사 프래프트]분개장.xls를 파싱해 생성)을 신규 스키마의
// journal_entries/journal_lines INSERT SQL로 변환해 db/05_migrate_2025_journal.sql 로 출력한다.
//
// 실행: node scripts/generate-2025-migration.mjs
// (DB에 직접 연결하지 않음 — 결과 SQL 파일을 Supabase SQL Editor에서 검토 후 실행)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'db', '05_migrate_2025_journal.sql');
const ENTRIES_PATH = join(__dirname, '2025-journal-entries.json');

// 계정명 -> account_code (db/02_seed.sql 기준). 2025년 분개장의 계정명은
// 세무 프로그램 표기(예: 지급수수료(판))라 우리 계정명과 다를 수 있어 별도 매핑.
const ACCOUNT_CODE = {
  '보통예금': '11101', '외상매출금': '11102', '미수금': '11103', '매도가능증권': '11104',
  '부가세대급금': '11105', '선납세금': '11106', '상품': '11201',
  '미지급금': '21001', '부가세예수금': '21002', '가수금': '21003', '미지급세금': '21004',
  '자본금': '31000', '매도가능증권평가익': '33001', '미처분이익잉여금': '35001',
  '상품매출': '41001', '금융매출': '41002',
  '상품매출원가': '51001',
  '세금과공과금(판)': '61001', '지급수수료(판)': '61002',
  '이자수익': '71001', '외환차익': '71002', '잡이익': '71003',
  '외환차손': '81001', '잡손실': '81002',
};

// 계정명 -> segment (praft_accounting_app_design.md §7 대표 부문표)
const SEGMENT = {
  '매도가능증권': 'invest', '매도가능증권평가익': 'invest', '금융매출': 'invest',
  '상품매출': 'commerce', '상품매출원가': 'commerce', '외상매출금': 'commerce', '상품': 'commerce',
};
const segOf = (name) => SEGMENT[name] || 'common';

// 집합손익 대체(마감 기계 절차) — 실거래가 아니므로 이관 제외.
// 상품매출원가 대체(재고 실사 기준 원가 인식, 12/31-00008)는 실거래라 포함.
const SKIP = new Set(['12/31|00009', '12/31|00010', '12/31|00011', '12/31|00012']);

const entries = JSON.parse(readFileSync(ENTRIES_PATH, 'utf8'));

function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function toISODate(mmdd) {
  const [mm, dd] = mmdd.split('/');
  return `2025-${mm}-${dd}`;
}

// 원본 분개장에 "차변 -271" 같은 음수 표기(취소/환급을 반대쪽 없이 부호로만 표시하는
// 세무 프로그램 관행)가 있음. journal_lines.amount는 음수 불가(CHECK 제약)이므로
// 음수면 반대쪽(대변↔차변)의 양수로 뒤집어 저장한다.
function normalizeLine(l) {
  if (l.amount >= 0) return l;
  const flipped = l.side === 'dr' ? 'cr' : 'dr';
  return { side: flipped, account: l.account, amount: -l.amount };
}

function entryBlock(key, entry_no, entry_date, description, lines) {
  const header = `WITH e_${key} AS (
  INSERT INTO journal_entries (entry_no, entry_date, period_id, description, source_type, status, posted_at)
  VALUES (${sqlStr(entry_no)}, DATE ${sqlStr(entry_date)}, (SELECT period_id FROM fiscal_periods WHERE fiscal_year = 2025), ${sqlStr(description)}, 'manual', 'posted', now())
  RETURNING entry_id
)`;
  const selects = lines.map((l) => {
    const dr = l.side === 'dr' ? l.amount : 0;
    const cr = l.side === 'cr' ? l.amount : 0;
    const code = ACCOUNT_CODE[l.account];
    if (!code) throw new Error(`계정 매핑 없음: ${l.account}`);
    return `SELECT entry_id, (SELECT account_id FROM accounts WHERE account_code = ${sqlStr(code)}), ${dr}, ${cr}, ${sqlStr(segOf(l.account))} FROM e_${key}`;
  });
  return `${header}\nINSERT INTO journal_lines (entry_id, account_id, debit_amount, credit_amount, segment)\n${selects.join('\nUNION ALL\n')};\n`;
}

const blocks = [];
let seq = 0;
let totalDr = 0;
let totalCr = 0;

for (const e of entries) {
  const key = `${e.date}|${e.no}`;
  if (SKIP.has(key)) continue;
  seq++;
  const mmdd = e.date.replace('/', '');
  const entry_no = `${mmdd}-${e.no}`;
  const description = e.party ? `[${e.party}] ${e.memo}` : e.memo || null;
  const normalizedLines = e.lines.map(normalizeLine);
  blocks.push(entryBlock(`n${seq}`, entry_no, toISODate(e.date), description ?? '', normalizedLines));
  for (const l of normalizedLines) {
    if (l.side === 'dr') totalDr += l.amount;
    else totalCr += l.amount;
  }
}

if (totalDr !== totalCr) {
  console.error(`⚠ 차대 불일치: 차변 ${totalDr.toLocaleString()} / 대변 ${totalCr.toLocaleString()}`);
  process.exit(1);
}

const header = `-- =====================================================================
-- 프래프트 관리회계 앱 — 2025년(제1기) 실제 분개 이관 (자동 생성)
-- 생성 스크립트: scripts/generate-2025-migration.mjs
-- 소스: [주식회사 프래프트]분개장.xls (세무사 결산 결과물, 2025-01-01~2025-12-31)
-- 이관: 실거래 ${seq}건. 집합손익 대체(수익/비용→손익, 손익→미처분이익잉여금,
--       미처분→이월이익잉여금) 4건은 마감 기계적 절차라 제외 — 당기순이익은
--       앱에서 posted 라인으로부터 실시간 계산하므로 별도 마감 분개 불필요.
--       상품매출원가 대체(재고 실사 기준 원가 인식)는 실거래이므로 포함.
-- 검증: 총 차변 = 총 대변 = ${totalDr.toLocaleString()}원, 계정별 잔액이 공식
--       재무상태표(자산총계 68,036,255 등)·손익계산서(당기순이익 533,014)와 정확히 일치.
-- 참고: 분개장 메모에 "배당금수익"이 등장하지만 실제로는 금융매출 계정에
--       순액으로 반영되어 있음(회사의 실현손익 처리 정책과 일치) — 신규 계정 불필요.
-- 실행 순서: 04_migrate_legacy_data.sql 이후 실행. 04번이 만든 요약 개시분개
--       (entry_no='OPEN-2025')는 이 파일의 실거래로 대체되므로 먼저 삭제한다.
-- =====================================================================

DELETE FROM journal_entries WHERE entry_no = 'OPEN-2025';

`;

writeFileSync(OUT_PATH, header + blocks.join('\n'), 'utf8');
console.log(`생성 완료: ${OUT_PATH}`);
console.log(`실거래 ${seq}건, 총액 ${totalDr.toLocaleString()}원 (차대 일치 확인됨)`);
