// 증권 매매·배당금 자동분개 계산 로직 (순수 함수 — DB 조회/쓰기는 페이지에서 담당).
// 이동평균법: 매수 시마다 (기존원가+신규매입원가)÷총수량으로 평균단가 갱신,
// 매도 시 그 평균단가를 원가로 사용해 즉시 실현손익 인식한다(세무사의 연말 일괄 인식 관행과 다름 —
// 이 앱은 실시간 재무 파악이 목적이라 거래 단위로 완결한다).
// 수수료는 매수 시 취득원가에 가산(자본화), 매도 시 매도대금에서 차감(순매도대금) — K-GAAP 원칙.

// 같은 파일 재업로드 시 securities_transactions에 중복 적재되지 않도록 하는 키.
// seq는 같은 계좌·날짜·종목·거래유형이 반복되는 경우(같은 날 같은 종목 여러 건)를 구분한다.
export function securitiesDedupKey(finAccountId, txn, seq) {
  return `${finAccountId}|${txn.txn_date}|${txn.kind}|${txn.ticker ?? ''}|${txn.quantity ?? ''}|${txn.unit_price_usd ?? txn.gross_usd ?? ''}|${seq}`;
}

// fxRates: [{rate_date, rate}] 배열에서 date 이하 가장 가까운 환율을 찾는다(주말/공휴일 갭 대응).
// 단, 그 갭이 MAX_FALLBACK_DAYS(연휴 포함해도 충분한 여유치)를 넘으면 null을 반환한다 —
// 그래야 fx_rates 시딩이 아예 안 된 새 달(예: seed는 2025년까지만 있는데 2026년 거래가 들어온 경우)에
// 몇 달 전 환율로 조용히 잘못 계산되는 대신 "환율 미확보"로 화면에 드러나 분개 생성이 막힌다.
const MAX_FALLBACK_DAYS = 10;
export function findFxRate(fxRates, date) {
  const candidates = fxRates.filter((r) => r.rate_date <= date).sort((a, b) => b.rate_date.localeCompare(a.rate_date));
  if (!candidates.length) return null;
  const gapDays = (new Date(date) - new Date(candidates[0].rate_date)) / 86400000;
  if (gapDays > MAX_FALLBACK_DAYS) return null;
  return Number(candidates[0].rate);
}

export function computeBuy(lot, txn, fxRate) {
  const costKrw = Math.round((Number(txn.quantity) * Number(txn.unit_price_usd) + Number(txn.fee_usd)) * fxRate);
  const prevQty = lot ? Number(lot.quantity) : 0;
  const prevCostBasis = lot ? Number(lot.cost_basis) : 0;
  const newQty = prevQty + Number(txn.quantity);
  const newCostBasis = prevCostBasis + costKrw;
  const newUnitCost = newQty > 0 ? newCostBasis / newQty : 0;
  return { costKrw, newQty, newUnitCost, newCostBasis };
}

export function computeSell(lot, txn, fxRate) {
  const qty = Number(txn.quantity);
  const proceedsKrw = Math.round((qty * Number(txn.unit_price_usd) - Number(txn.fee_usd)) * fxRate);
  const unitCost = lot ? Number(lot.unit_cost) : 0;
  const costRemoved = Math.round(qty * unitCost);
  const gainLoss = proceedsKrw - costRemoved;
  const newQty = (lot ? Number(lot.quantity) : 0) - qty;
  const newCostBasis = (lot ? Number(lot.cost_basis) : 0) - costRemoved;
  return { proceedsKrw, costRemoved, gainLoss, newQty, newCostBasis };
}

export function computeDividend(txn, fxRate) {
  const grossKrw = Math.round(Number(txn.gross_usd) * fxRate);
  const taxKrw = Math.round(Number(txn.tax_usd) * fxRate);
  return { grossKrw, taxKrw, netKrw: grossKrw - taxKrw };
}

// 분개 2줄: 차)매도가능증권(원가) / 대)GL계정(같은 금액)
export function buildBuyLines(costKrw, securitiesAccountId, glAccountId, segment = 'invest') {
  return [
    { account_id: securitiesAccountId, debit_amount: costKrw, credit_amount: 0, segment },
    { account_id: glAccountId, debit_amount: 0, credit_amount: costKrw, segment },
  ];
}

// 분개 3줄: 차)GL계정(순매도대금) / 대)매도가능증권(원가) / 차·대)금융영업비용·수익(차액)
export function buildSellLines({ proceedsKrw, costRemoved, gainLoss }, securitiesAccountId, glAccountId, gainAccountId, lossAccountId, segment = 'invest') {
  const lines = [
    { account_id: glAccountId, debit_amount: proceedsKrw, credit_amount: 0, segment },
    { account_id: securitiesAccountId, debit_amount: 0, credit_amount: costRemoved, segment },
  ];
  if (gainLoss > 0) lines.push({ account_id: gainAccountId, debit_amount: 0, credit_amount: gainLoss, segment });
  else if (gainLoss < 0) lines.push({ account_id: lossAccountId, debit_amount: -gainLoss, credit_amount: 0, segment });
  return lines;
}

// 분개: 차)GL계정(실수령) + 차)선납세금(원천세, 있으면) / 대)금융영업수익(총배당금)
export function buildDividendLines({ grossKrw, taxKrw, netKrw }, glAccountId, taxAccountId, incomeAccountId, segment = 'invest') {
  const lines = [{ account_id: glAccountId, debit_amount: netKrw, credit_amount: 0, segment }];
  if (taxKrw > 0) lines.push({ account_id: taxAccountId, debit_amount: taxKrw, credit_amount: 0, segment });
  lines.push({ account_id: incomeAccountId, debit_amount: 0, credit_amount: grossKrw, segment });
  return lines;
}
