// 세무조정 공용 로직 (순수 함수 — DB 접근은 페이지에서).

// 소득 증가 방향인지. 익금산입·손금불산입은 소득을 늘리고(가산), 손금산입·익금불산입은 줄인다(차감).
export const ADD_TYPES = ['익금산입', '손금불산입'];
export const SUB_TYPES = ['손금산입', '익금불산입'];
export const ALL_TYPES = [...ADD_TYPES, ...SUB_TYPES];
export const DISPOSALS = ['유보', '△유보', '기타', '상여', '배당', '기타사외유출'];

export function isAddition(adjustType) {
  return ADD_TYPES.includes(adjustType);
}

// 각 조정이 과세표준에 미치는 부호 있는 금액.
export function signedAmount(adj) {
  return (isAddition(adj.adjust_type) ? 1 : -1) * Number(adj.amount);
}

// 유보 잔액에 미치는 영향.
// △유보는 세무상 자산을 회계보다 작게 보는 것(음수 잔액), 유보는 그 반대(양수 잔액)다.
// 예) 매도가능증권평가익을 익금불산입 △유보로 잡으면 유보잔액이 -18,919,241이 되고,
//     매도 시 익금산입 유보로 추인하면 +되어 0으로 소멸한다.
export function reserveDelta(adj) {
  if (adj.disposal === '유보') return Number(adj.amount) * (isAddition(adj.adjust_type) ? 1 : -1);
  if (adj.disposal === '△유보') return Number(adj.amount) * (isAddition(adj.adjust_type) ? 1 : -1);
  return 0; // 기타·사외유출은 이월되지 않는다
}

// 연도별 유보 이월표(자본금과적립금조정명세서 을) 산출.
// 항목명(item_name) 단위로 기초 → 증감 → 기말을 누적한다.
export function buildReserveLedger(adjustments, targetYear) {
  const items = new Map(); // item_name -> {opening, increase, decrease}
  const reserveOnly = adjustments.filter((a) => a.disposal === '유보' || a.disposal === '△유보');

  for (const a of reserveOnly) {
    const rec = items.get(a.item_name) ?? { item_name: a.item_name, opening: 0, increase: 0, decrease: 0 };
    const delta = reserveDelta(a);
    if (a.fiscal_year < targetYear) rec.opening += delta;
    else if (a.fiscal_year === targetYear) {
      if (delta >= 0) rec.increase += delta;
      else rec.decrease += -delta;
    }
    items.set(a.item_name, rec);
  }

  return [...items.values()]
    .map((r) => ({ ...r, closing: r.opening + r.increase - r.decrease }))
    .filter((r) => r.opening !== 0 || r.increase !== 0 || r.decrease !== 0);
}

// 과세표준 계산: 결산서상 당기순이익 + 익금산입·손금불산입 − 손금산입·익금불산입
export function computeTaxableIncome(netIncome, adjustments) {
  const additions = adjustments.filter((a) => isAddition(a.adjust_type)).reduce((s, a) => s + Number(a.amount), 0);
  const subtractions = adjustments.filter((a) => !isAddition(a.adjust_type)).reduce((s, a) => s + Number(a.amount), 0);
  return { netIncome, additions, subtractions, taxableIncome: netIncome + additions - subtractions };
}

// 법인세 산출세액(2026년 기준 세율). 지방소득세는 법인세액의 10%로 별도 부과된다.
const BRACKETS = [
  { limit: 200000000, rate: 0.09 },
  { limit: 20000000000, rate: 0.19 },
  { limit: 300000000000, rate: 0.21 },
  { limit: Infinity, rate: 0.24 },
];

export const CREDIT_TYPES = ['중간예납', '원천납부', '외국납부세액', '기타공제'];
// 기납부세액은 이미 낸 세금이라 한도 없이 전액 차감된다. 세액공제는 한도 계산이 따로 붙는다.
export const PREPAID_TYPES = ['중간예납', '원천납부'];

// 외국납부세액공제 한도 = 산출세액 × (국외원천소득 ÷ 과세표준).
// 한도 초과분은 당기에 공제받지 못하고 10년간 이월된다.
export function foreignTaxCreditLimit(corporateTax, foreignIncome, taxableIncome) {
  if (taxableIncome <= 0 || foreignIncome <= 0) return 0;
  return Math.floor(corporateTax * Math.min(foreignIncome / taxableIncome, 1));
}

// 산출세액에서 세액공제·기납부세액을 차감해 실제 납부할 세액을 구한다.
export function applyCredits(corporateTax, taxableIncome, credits) {
  const foreignRows = credits.filter((c) => c.credit_type === '외국납부세액');
  const foreignPaid = foreignRows.reduce((s, c) => s + Number(c.amount), 0);
  const foreignIncome = foreignRows.reduce((s, c) => s + Number(c.foreign_income ?? 0), 0);
  const limit = foreignTaxCreditLimit(corporateTax, foreignIncome, taxableIncome);
  const foreignCredit = Math.min(foreignPaid, limit);
  const foreignCarryover = foreignPaid - foreignCredit;

  const otherCredit = credits.filter((c) => c.credit_type === '기타공제').reduce((s, c) => s + Number(c.amount), 0);
  const prepaid = credits.filter((c) => PREPAID_TYPES.includes(c.credit_type)).reduce((s, c) => s + Number(c.amount), 0);

  const totalBurden = Math.max(corporateTax - foreignCredit - otherCredit, 0);
  return {
    foreignPaid, foreignIncome, foreignLimit: limit, foreignCredit, foreignCarryover,
    otherCredit, prepaid, totalBurden, payable: totalBurden - prepaid,
  };
}

export function computeCorporateTax(taxableIncome) {
  if (taxableIncome <= 0) return { corporateTax: 0, localTax: 0, total: 0, detail: [] };
  let remaining = taxableIncome;
  let prev = 0;
  let tax = 0;
  const detail = [];
  for (const b of BRACKETS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, b.limit - prev);
    const amount = Math.floor(slice * b.rate);
    detail.push({ from: prev, to: Math.min(taxableIncome, b.limit), rate: b.rate, base: slice, amount });
    tax += amount;
    remaining -= slice;
    prev = b.limit;
  }
  const localTax = Math.floor(tax * 0.1);
  return { corporateTax: tax, localTax, total: tax + localTax, detail };
}
