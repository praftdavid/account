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

// 해외배당 원천세 처리는 법인세법 §57에 따라 세액공제법/손금산입법 중 선택 가능(elective).
// 이 회사는 미국 원천세율(15%)이 법인세 한계세율(9~19%)보다 높아 세액공제 한도(산출세액×국외원천소득/과세표준)에
// 걸려 실익이 적으므로, 손금산입법과 결과가 같은 순액법을 쓴다(원천세를 자산으로 잡지 않고 배당수익을
// 세후 순액으로 인식) — 2025년 세무사가 실제로 처리한 방식과 동일(테슬라·버티브 등 배당수익 332,522원이
// 미국 원천세 15% 차감 순액으로 잡혀 있고, 선납세금·외국납부세액공제 둘 다 신청 안 함).
// 국내(원화) 배당·이자의 원천징수세액은 실제 기납부세액으로 전액 공제되므로 계속 선납세금 자산으로 잡는다.
//
// 전환 시점: 연간 과세표준(회사 전체, 증권계좌만이 아님)이 커져 평균세율이 15%를 넘어서면
// (현재 세율 구간 기준 대략 5억원 지점) 세액공제 한도에 여유가 생겨 총액법(세액공제법)으로 바꾸는 게 유리해진다.
export function computeDividend(txn, fxRate) {
  const grossKrw = Math.round(Number(txn.gross_usd) * fxRate);
  const taxKrw = Math.round(Number(txn.tax_usd) * fxRate);
  return { grossKrw, taxKrw, netKrw: grossKrw - taxKrw, isForeign: txn.currency !== 'KRW' };
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

// 매도 시 OCI(공정가치 마크업) 추인 — §7-A 재평가로 11104에 실려있던 그 종목의 마크업분을
// 매도 수량 비례로 제거한다. 안 그러면 이미 판 종목의 평가차액이 11104에 영구히 남는 회계 오류가 생긴다
// (매도 분개는 원가만 대변 처리하므로, 마크업은 이 함수가 아니면 어디서도 안 지워짐).
// lot.unrealized_oci가 없거나(백필 전) 0이면 추인할 게 없다.
export function computeOciReversal(lot, soldQty) {
  const oci = lot ? Number(lot.unrealized_oci ?? 0) : 0;
  const qty = lot ? Number(lot.quantity) : 0;
  if (!oci || !qty) return { reversedOci: 0, remainingOci: oci };
  const reversedOci = Math.round((oci * Number(soldQty)) / qty);
  return { reversedOci, remainingOci: oci - reversedOci };
}

// reversedOci>0(그 종목 몫 평가이익 제거): 차)매도가능증권평가익(33001) / 대)매도가능증권(11104).
// reversedOci<0(평가손실 몫 제거)이면 반대. 손익 계정은 안 건드리므로 당기순이익에 영향 없음.
export function buildOciReversalLines(reversedOci, securitiesAccountId, ociAccountId, segment = 'invest') {
  if (!reversedOci) return [];
  const amt = Math.abs(reversedOci);
  return reversedOci > 0
    ? [
        { account_id: ociAccountId, debit_amount: amt, credit_amount: 0, segment },
        { account_id: securitiesAccountId, debit_amount: 0, credit_amount: amt, segment },
      ]
    : [
        { account_id: securitiesAccountId, debit_amount: amt, credit_amount: 0, segment },
        { account_id: ociAccountId, debit_amount: 0, credit_amount: amt, segment },
      ];
}

// 재평가(증권 재평가 화면용): 종목의 새 공정가치와 취득원가 차이 = 새 unrealized_oci.
// delta = 이번에 추가/차감해야 할 변동분(직전 unrealized_oci 대비) — 반기 재평가 JE·세무조정 금액이 된다.
export function computeRevaluation(lot, fairValue) {
  const newOci = Math.round(Number(fairValue) - Number(lot.cost_basis));
  const prevOci = Number(lot.unrealized_oci ?? 0);
  return { newOci, delta: newOci - prevOci };
}

// 분개: 해외(순액법) — 차)GL계정(순액) / 대)금융영업수익(순액), 원천세는 자산화하지 않음.
//       국내 — 차)GL계정(실수령) + 차)선납세금(원천세, 있으면) / 대)금융영업수익(총배당금), 기존과 동일.
export function buildDividendLines({ grossKrw, taxKrw, netKrw, isForeign }, glAccountId, taxAccountId, incomeAccountId, segment = 'invest') {
  if (isForeign) {
    return [
      { account_id: glAccountId, debit_amount: netKrw, credit_amount: 0, segment },
      { account_id: incomeAccountId, debit_amount: 0, credit_amount: netKrw, segment },
    ];
  }
  const lines = [{ account_id: glAccountId, debit_amount: netKrw, credit_amount: 0, segment }];
  if (taxKrw > 0) lines.push({ account_id: taxAccountId, debit_amount: taxKrw, credit_amount: 0, segment });
  lines.push({ account_id: incomeAccountId, debit_amount: 0, credit_amount: grossKrw, segment });
  return lines;
}
