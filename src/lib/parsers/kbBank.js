import * as XLSX from 'xlsx';

// 국민은행 계좌 거래내역(.xls) 파서. 헤더 행을 "거래일시" 컬럼 유무로 찾아
// 위치가 바뀌어도 안전하게 인식한다.
// 반환: [{txn_date(YYYY-MM-DD), amount(+입금/-출금), memo, balance_after}]
export async function parseKbBank(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c).includes('거래일시')));
  if (headerIdx === -1) throw new Error('국민은행 거래내역 형식을 인식할 수 없습니다(헤더 행을 찾지 못함)');
  const header = rows[headerIdx].map((h) => String(h).trim());
  const col = (name) => header.indexOf(name);
  const idxDate = col('거래일시');
  const idxCounterparty = col('보낸분/받는분');
  const idxOut = col('출금액(원)');
  const idxIn = col('입금액(원)');
  const idxBalance = col('잔액(원)');
  const idxNote = col('적요');

  const toNumber = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const dateRaw = String(r[idxDate] ?? '').trim();
    if (!dateRaw) continue;
    const datePart = dateRaw.split(' ')[0].replace(/\./g, '-');
    const outAmt = toNumber(r[idxOut]);
    const inAmt = toNumber(r[idxIn]);
    const amount = inAmt > 0 ? inAmt : -outAmt;
    if (amount === 0) continue;
    const counterparty = String(r[idxCounterparty] ?? '').trim();
    const note = idxNote >= 0 ? String(r[idxNote] ?? '').trim() : '';
    const memo = note && note !== counterparty ? `${counterparty} (${note})` : counterparty;
    out.push({ txn_date: datePart, amount, memo, balance_after: toNumber(r[idxBalance]) });
  }
  return out;
}
