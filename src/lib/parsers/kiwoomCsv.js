import * as XLSX from 'xlsx';

// 키움증권 월중 거래내역 CSV 파서. 이 내보내기는 EUC-KR(CP949) 인코딩이고,
// 거래 1건이 2행(원화 기준 행 + 외화/종목 상세 행)으로 나뉘어 있다.
// 반환: {cash: [...], securities: [...]}
//  - cash: 원화 예수금잔고가 실제로 바뀐 행(환전/이자/세금 등 실제 현금 이동)
//  - securities: 매수/매도(상세행에 종목명이 있는 행)·배당(적요에 "배당" 포함) —
//    원화 환산·이동평균·분개는 별도 화면(증권 거래 분개)에서 처리
export async function parseKiwoomCsv(file) {
  const buf = await file.arrayBuffer();
  const text = decodeKoreanText(buf);

  // raw:true 필수 — false면 "2026/07/09" 같은 날짜형 문자열을 SheetJS가 임의로
  // "7/9/26" 등으로 재포맷해버려 날짜 인식이 깨진다.
  const wb = XLSX.read(text, { type: 'string', raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c).includes('거래일자')));
  if (headerIdx === -1) throw new Error('키움증권 CSV 형식을 인식할 수 없습니다(헤더 행을 찾지 못함)');

  const toNumber = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;
  const DATE_RE = /^\d{4}\/\d{2}\/\d{2}$/;

  // 1단계: 날짜로 시작하는 행(원화 기준)+바로 다음 상세행(외화/종목)을 묶어 이벤트로 만든다.
  // 원화 예수금잔고는 매수/매도/배당 행에서도 값이 찍히므로(대부분 0, 변동 없음), 분류 전
  // 전체 시퀀스를 대상으로 diff를 계산해야 기준잔액 연속성이 끊기지 않는다.
  const events = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const rowA = rows[i];
    const dateRaw = String(rowA[0] ?? '').trim();
    if (!DATE_RE.test(dateRaw)) continue; // 상세행(2번째 행)은 여기서 자연히 건너뜀
    const rowB = rows[i + 1] ?? [];
    events.push({
      txn_date: dateRaw.replace(/\//g, '-'),
      desc: String(rowA[2] ?? '').trim(), // 적요명
      name: String(rowB[2] ?? '').trim(), // 종목명(있으면 매수/매도/배당 거래)
      quantity: toNumber(rowA[3]),
      unit_price_usd: toNumber(rowB[3]),
      fee_usd: toNumber(rowB[5]),
      gross_usd: toNumber(rowB[4]),
      tax_usd: toNumber(rowB[8]),
      krw_balance: toNumber(rowA[9]),
    });
  }

  // 2단계: 분류 + diff. prevBalance는 매수/매도/배당 행에서도 계속 갱신한다(값 자체는
  // 보통 불변이라 diff에 영향 없음 — 그래야 다음 현금성 이벤트의 diff 기준이 안 끊긴다).
  const cash = [];
  const securities = [];
  let prevBalance = 0;
  for (const e of events) {
    const isBuy = e.name && /매수/.test(e.desc);
    const isSell = e.name && /매도/.test(e.desc);
    const isDividend = /배당/.test(e.desc);
    // 배당은 "최초입금 → 취소출금(같은 금액) → 정정입금(들)"으로 여러 줄에 걸쳐 나올 수 있다
    // (적요명이 전부 "배당"을 포함해서 취소도 배당으로 잡힘 — kiwoomPdf.js에서 실제로 발견된 문제와
    // 동일). 적요에 "취소"가 있으면 부호를 반대로 해 이중 계상을 막는다.
    const isCancellation = /취소/.test(e.desc);

    if (isBuy || isSell) {
      securities.push({
        kind: 'trade', txn_date: e.txn_date, side: isBuy ? 'buy' : 'sell', ticker: e.name, name: e.name,
        currency: 'USD', quantity: e.quantity, unit_price_usd: e.unit_price_usd, fee_usd: e.fee_usd,
      });
    } else if (isDividend) {
      const sign = isCancellation ? -1 : 1;
      securities.push({ kind: 'dividend', txn_date: e.txn_date, ticker: e.name || null, name: e.name || e.desc, currency: 'USD', gross_usd: sign * e.gross_usd, tax_usd: sign * e.tax_usd });
    } else {
      const amount = e.krw_balance - prevBalance;
      if (amount !== 0) cash.push({ txn_date: e.txn_date, amount, memo: e.desc, balance_after: e.krw_balance });
    }
    prevBalance = e.krw_balance;
  }
  return { cash, securities };
}

function decodeKoreanText(buf) {
  const eucKr = new TextDecoder('euc-kr').decode(buf);
  if (!eucKr.includes('�')) return eucKr;
  return new TextDecoder('utf-8').decode(buf);
}
