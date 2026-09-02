import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const DATE_RE = /^\d{4}\.\d{2}\.\d{2}/;
const NUM_RE = /^-?[\d,]+(\.\d+)?$/;

// 텍스트 아이템을 y좌표(같은 줄)로 묶고 x좌표(왼쪽→오른쪽)로 정렬해 표의 각 행을 복원한다.
// (kiwoomPdf.js와 동일한 접근 — KB "계좌 거래내역 조회" PDF는 거래 1건이 물리적으로 1행이라 더 단순함.)
async function extractRows(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const allRows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({ x: it.transform[4], y: it.transform[5], str: it.str }))
      .filter((it) => it.str.trim());
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const rows = [];
    let current = null;
    for (const it of items) {
      if (!current || Math.abs(it.y - current.y) > 3) {
        current = { y: it.y, items: [] };
        rows.push(current);
      }
      current.items.push(it);
    }
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      allRows.push(r.items.map((i) => i.str.trim()).filter(Boolean));
    }
  }
  return allRows;
}

// 국민은행 "계좌 거래내역 조회" PDF 파서. 헤더: 거래일시 | 적요 | 보낸분/받는분 | 출금액 | 입금액 | 잔액 | 송금메모 | 거래점
// 한 행 예: 2026.03.31 08:43:58  스마트출금  국세-주식회사  46,770  0  793,705  -  평택고
//
// "결산이자"처럼 적요 텍스트가 좌표상 여러 조각으로 쪼개지는 경우가 있어(예: "결"+"산이자"+"이자세금:0원"
// 세 토큰), 앞쪽(적요·보낸분/받는분)을 고정 인덱스로 나누지 않는다. 대신 뒤에서부터 거래점·송금메모·잔액·
// 입금액·출금액 5개를 고정 파싱하고, 날짜(맨 앞) 다음부터 그 앞까지 남는 토큰을 전부 적요로 합친다
// (검토 화면에서 사람이 보는 용도라 "결산이자 이자세금:0원"처럼 합쳐져도 정보 손실이 없다).
// 반환: [{txn_date(YYYY-MM-DD), amount(+입금/-출금), memo, balance_after}]
export async function parseKbBankPdf(file) {
  const rows = await extractRows(file);

  const header = rows.slice(0, 15).map((r) => r.join(' ')).join('\n');
  if (!header.includes('거래일시') || !header.includes('보낸분/받는분')) {
    throw new Error('국민은행 "계좌 거래내역 조회" PDF 형식을 인식할 수 없습니다.');
  }

  const toNumber = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;
  const out = [];

  for (const tokens of rows) {
    if (!DATE_RE.test(tokens[0] ?? '')) continue;
    if (tokens.length < 6) continue; // 날짜+최소 출금/입금/잔액/송금메모/거래점

    const txn_date = tokens[0].split(' ')[0].replace(/\./g, '-');
    const rest = tokens.slice(1);
    // 뒤에서부터: 거래점, 송금메모, 잔액, 입금액, 출금액
    const branch = rest[rest.length - 1];
    const memoNote = rest[rest.length - 2];
    const balance = rest[rest.length - 3];
    const inAmt = rest[rest.length - 4];
    const outAmt = rest[rest.length - 5];
    if (!NUM_RE.test(balance) || !NUM_RE.test(inAmt) || !NUM_RE.test(outAmt)) continue; // 예상 형식과 다르면 건너뜀

    const descTokens = rest.slice(0, rest.length - 5);
    const memo = descTokens.join(' ').trim();

    const amount = toNumber(inAmt) > 0 ? toNumber(inAmt) : -toNumber(outAmt);
    if (amount === 0) continue;

    out.push({ txn_date, amount, memo: memo || branch, balance_after: toNumber(balance) });
  }
  return out;
}
