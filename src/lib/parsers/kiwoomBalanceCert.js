import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const NUM_RE = /^-?[\d,]+(\.\d+)?$/;
const toNumber = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;

// kiwoomPdf.js와 같은 좌표 기반 행 재구성(같은 y좌표=같은 행, x좌표순 정렬) — 다칼럼 표에서
// 텍스트스트림 추출은 줄바꿈이 뒤섞이므로 pdfjs-dist 좌표로 직접 재구성해야 신뢰할 수 있다.
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

// 이름을 종목코드 없이 비교해야 해서(이 문서엔 종목코드가 없음) 공백·대소문자 차이를 무시하고 매칭한다
// (문서엔 "알파벳 A", 시스템엔 "알파벳A"처럼 띄어쓰기가 다름).
export function normalizeName(s) {
  return String(s ?? '').replace(/\s+/g, '').toUpperCase();
}

// 일부 발급분(2025년 12월말 등)은 평가단가의 소수점이 셀 줄바꿈으로 "530,841." + "25" 두 토큰으로
// 쪼개져 나온다(2026년 상반기분은 안 쪼개짐 — 발급 시점마다 PDF 레이아웃이 미묘하게 다름).
// 소수점만 남고 끝나는 숫자 토큰 다음에 순수 숫자 토큰이 오면 하나로 합쳐 원래 값을 복원한다.
function mergeSplitDecimals(tokens) {
  const merged = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (/^-?[\d,]+\.$/.test(t) && next && /^\d{1,3}$/.test(next)) {
      merged.push(t + next);
      i++;
    } else {
      merged.push(t);
    }
  }
  return merged;
}

// 키움증권 잔고증명서(2페이지 "보유 증권 명세서" 표) 파서. 한 행 예:
// 미국 | 알파벳 A | 31 | 550,885.85 | 17,077,461 | 0  (구분/종목명/수량/평가단가/평가금액(원)/질권수량)
// "종합 거래내역 조회"(거래이력, kiwoomPdf.js가 다루는 문서)와는 컬럼 구성이 완전히 다른 별도 문서라서
// 반드시 화이트리스트 방식(정확한 표제가 있어야만 통과)으로 형식을 먼저 검증한다.
//
// 표가 끝나는 지점을 정확한 표식(예: "※")으로 판단하지 않는다 — 발급분마다 "질권(권리제한)수량"
// 헤더가 두 줄로 쪼개져 표 중간에 낱토큰 행("수량")이 섞여 들어오는 경우가 있어(2025년 12월말 발급분
// 실제로 이렇게 나옴), 각 행을 개별적으로 "보유종목 행처럼 생겼는지" 판정해 걸러내는 방식이 더 안전하다.
// 반환: { asOfDate, accountNoMasked, holdings: [{ name, quantity, unitPrice, fairValue }] }
export async function parseKiwoomBalanceCert(file) {
  const rows = await extractRows(file);
  // 문서 제목 표기가 발급 시점마다 다르다 — 2026년 상반기분은 1페이지 맨 위에 "잔 고 증 명 서"
  // 타이틀이 텍스트로 있지만, 2025년 12월말분은 그 타이틀 없이 바로 "일련번호"부터 시작한다.
  // 두 발급분 모두 공통으로 갖는 라벨은 "평가기준일자"(잔고증명서 특유의 항목 — 거래내역 PDF에는 없음).
  const header = rows.slice(0, 10).map((r) => r.join(' ')).join('\n');
  if (!header.includes('평가기준일자')) {
    throw new Error('이 PDF 형식을 인식할 수 없습니다. 키움증권 "잔고증명서"를 올려주세요.');
  }

  const acctMatch = header.match(/(\d{4}-\d{4}-\d{2})/);
  const dateMatch = header.match(/평가기준일자[^0-9]*(\d{4})년\s*(\d{2})월\s*(\d{2})일/);

  const headerRowIdx = rows.findIndex((r) => r[0] === '구분' && r[1] === '종목명' && r.some((t) => t.includes('평가금액')));
  if (headerRowIdx === -1) {
    throw new Error('"보유 증권 명세서" 표를 찾을 수 없습니다(문서 구성이 예상과 다릅니다).');
  }

  const holdings = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = mergeSplitDecimals(rows[i]);
    if (r.length < 6) continue; // 표 헤더가 두 줄로 쪼개져 생기는 낱토큰 행 등은 건너뜀
    const last4 = r.slice(-4);
    if (!last4.every((t) => NUM_RE.test(t))) continue;
    const name = r.slice(1, r.length - 4).join(' ').trim();
    if (!name) continue;
    const [quantity, unitPrice, fairValue] = last4;
    holdings.push({
      name,
      quantity: toNumber(quantity),
      unitPrice: toNumber(unitPrice),
      fairValue: toNumber(fairValue),
    });
  }

  return {
    asOfDate: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null,
    accountNoMasked: acctMatch ? acctMatch[1] : null,
    holdings,
  };
}
