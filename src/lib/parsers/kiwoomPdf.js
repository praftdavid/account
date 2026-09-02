import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const NUM_RE = /^-?[\d,]+(\.\d+)?$/;

// 텍스트 아이템을 y좌표(같은 줄)로 묶고 x좌표(왼쪽→오른쪽)로 정렬해 표의 각 행을 복원한다.
// 단순 텍스트스트림 추출(pdftotext 기본모드)은 다칼럼 표에서 줄바꿈이 뒤섞이기 쉬워
// 좌표 기반으로 직접 재구성한다.
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

const toNumber = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;

// 매체구분 행의 "원거래번호 종목코드" 칸은 좌표상 한 토큰으로 붙는 경우("0 FTNT")와
// 별도 토큰으로 떨어지는 경우(["0","FTNT"])가 있어 둘 다 처리한다.
function extractTicker(mediaRow) {
  const t2 = mediaRow[2] ?? '';
  if (t2.includes(' ')) {
    const parts = t2.trim().split(/\s+/);
    return { ticker: parts[parts.length - 1], nextIdx: 3 };
  }
  return { ticker: mediaRow[3] ?? '', nextIdx: 4 };
}

// 키움증권 "종합거래내역조회" PDF 파서. 한 행 예: 2025/02/18  1 이체입금(연계은행)  19,500,000  0  0.00  0.00  19,500,000
// 날짜로 시작하는 행만 거래로 인식. 거래유형(매수/매도/이체 등)마다 부호 표기가 제각각이라
// 신뢰하기보다, 행의 마지막 숫자(예수금잔고)를 직전 잔고와 비교해 실제 증감 부호를 구한다.
//
// 매수/매도/배당 거래는 원화 예수금잔고가 안 바뀌므로(위 로직으론 안 잡힘) 별도 판별한다 —
// 신용거래구분("보통매매")이 있으면 매매, 적요명에 "배당" 포함이면 배당. 이때 종목코드/수량/단가/수수료는
// 뒤따르는 통화행(+1)·매체구분행(+2)·처리시간행(+3)에서 좌표 기반 실측으로 확인한 고정 컬럼 위치로 읽는다
// (pdftotext -layout 같은 텍스트스트림 추출은 셀 줄바꿈이 뒤섞여 이 컬럼 위치를 신뢰할 수 없다 — 반드시
// pdfjs-dist 좌표 그룹 결과로만 검증해야 함. 실제 PDF의 FTNT 매도 10주(2025/07/23, @105.46, 수수료0.73)
// 사례로 대조 검증 완료).
// 반환: {cash: [...], securities: [...]}
export async function parseKiwoomPdf(file) {
  const rows = await extractRows(file);

  // 키움이 내려주는 PDF는 두 종류다 — "종합 거래내역 조회"(이 파서가 다루는 형식)와
  // "잔고 및 거래 명세서"(컬럼 구성이 완전히 다름). 후자를 이 파서로 읽으면 매매가 0건으로 나오면서
  // 조용히 통과해버려(실제로 계좌 2845 2026년 상반기 파일에서 이 일이 있었다) 장부에 거래가 누락된다.
  // 그래서 형식을 먼저 판별해 다른 문서면 명확히 실패시킨다.
  // 화이트리스트 방식(정확한 타이틀 문구가 있어야만 통과)으로 검사한다 — "잔고 및 거래 명세서"에도
  // 계좌 유형 표기("위탁종합")에 "종합"이라는 글자가 우연히 들어있어, 블랙리스트 방식(`!includes('종합')`)은
  // 실제로 이 케이스에서 뚫리는 것을 확인함.
  const header = rows.slice(0, 30).map((r) => r.join(' ')).join('\n');
  if (!header.includes('종합 거래내역 조회')) {
    throw new Error('이 PDF 형식을 인식할 수 없습니다. [종합 거래내역 조회]로 내려받은 PDF를 올려주세요(예: "잔고 및 거래 명세서" 형식은 미지원).');
  }

  const cash = [];
  const securities = [];
  let prevBalance = null;

  for (let i = 0; i < rows.length; i++) {
    const tokens = rows[i];
    if (!DATE_RE.test(tokens[0] ?? '')) continue;
    const txn_date = tokens[0].replace(/\//g, '-');

    const hasTxnNo = /^\d+$/.test(tokens[1] ?? '');
    const rest = hasTxnNo ? tokens.slice(2) : tokens.slice(1);
    const numTokens = rest.filter((t) => NUM_RE.test(t));
    const descTokens = rest.filter((t) => !NUM_RE.test(t));
    if (!numTokens.length) continue;

    // numTokens: [정산금액, 대출금상환, 거래금액(외), 정산금액(외), 예수금잔고]
    const isTrade = descTokens.length >= 2 && descTokens[1] === '보통매매';
    const isDividend = !isTrade && /배당/.test(descTokens[0] ?? '');

    if (isTrade || isDividend) {
      const settleKrw = toNumber(numTokens[0]);
      const grossForeign = toNumber(numTokens[2]);
      const netForeign = toNumber(numTokens[3]);
      const isKrwDenominated = grossForeign === 0 && netForeign === 0;

      const currencyRow = rows[i + 1] ?? [];
      const mediaRow = rows[i + 2] ?? [];
      const timestampRow = rows[i + 3] ?? [];
      const name = currencyRow.slice(2, -6).join('');
      const { ticker, nextIdx } = extractTicker(mediaRow);
      const quantity = toNumber(mediaRow[nextIdx]);
      const feeKrw = toNumber(mediaRow[nextIdx + 1]);
      const feeUsd = toNumber(mediaRow[nextIdx + 3]);
      const unitPrice = toNumber(timestampRow[4]);

      if (isTrade) {
        const side = descTokens[0].includes('매도') ? 'sell' : 'buy';
        securities.push({
          kind: 'trade',
          txn_date,
          side,
          ticker,
          name,
          currency: isKrwDenominated ? 'KRW' : 'USD',
          quantity,
          unit_price_usd: unitPrice,
          fee_usd: isKrwDenominated ? feeKrw : feeUsd,
        });
      } else {
        // 배당은 "최초입금 → 취소출금(같은 금액) → 정정입금(들)"으로 3~4줄에 걸쳐 나오는 경우가
        // 실제로 있다(적요명이 전부 "배당"을 포함해서 취소도 배당으로 잡힘). 입출구분(매체구분행의
        // 2번째 칸)이 "출금"이면 취소이므로 부호를 반대로 한다 — 안 그러면 취소분까지 이중으로
        // 더해져 배당수익이 실제보다 부풀려진다(2026년 7월 배당에서 실제로 발견된 문제).
        const isWithdrawal = mediaRow[1] === '출금';
        const sign = isWithdrawal ? -1 : 1;
        securities.push({
          kind: 'dividend',
          txn_date,
          ticker,
          name,
          currency: isKrwDenominated ? 'KRW' : 'USD',
          gross_usd: sign * (isKrwDenominated ? settleKrw : grossForeign),
          tax_usd: sign * (isKrwDenominated ? 0 : grossForeign - netForeign),
        });
      }
      prevBalance = toNumber(numTokens[numTokens.length - 1]);
      continue;
    }

    const firstAmt = toNumber(numTokens[0]);
    const balance_after = toNumber(numTokens[numTokens.length - 1]);
    const memo = descTokens.join(' ');

    // 잔고 차이로 부호를 구하되, 최초 행은 비교 기준이 없어 원본 첫 금액을 그대로 쓴다
    // (검토 화면에서 사람이 반드시 확인하므로 부호가 틀려도 여기서 걸러진다).
    const amount = prevBalance === null ? firstAmt : balance_after - prevBalance;
    prevBalance = balance_after;

    cash.push({ txn_date, amount, memo, balance_after });
  }
  return { cash, securities };
}
