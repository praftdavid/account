// 자동 분개 파이프라인 공용 로직 (설계 문서 §6, 6단계 중 2~4단계에 해당).
// 1단계(파싱)는 lib/parsers/*, 5~6단계(대사·검토확정)는 각 페이지에서 처리한다.

// 2단계: 같은 파일을 재업로드해도 raw_transactions에 중복 적재되지 않도록 하는 키.
// seq는 같은 계좌·날짜·금액·적요가 반복되는 경우(같은 날 같은 금액 여러 건)를 구분한다.
export function dedupKey(finAccountId, txnDate, amount, memo, seq) {
  return `${finAccountId}|${txnDate}|${amount}|${String(memo ?? '').slice(0, 40)}|${seq}`;
}

// 3단계: mapping_rules를 priority 오름차순(낮을수록 우선)으로 적요와 매칭해 상대계정을 제안한다.
export function suggestAccount(rawTxn, mappingRules) {
  const applicable = mappingRules
    .filter((r) => r.is_active)
    .filter((r) => !r.fin_account_scope || r.fin_account_scope === rawTxn.fin_account_id)
    .sort((a, b) => a.priority - b.priority);
  for (const rule of applicable) {
    if (matchesPattern(rawTxn.memo || '', rule.match_pattern)) return rule.target_account_id;
  }
  return null;
}

function matchesPattern(text, pattern) {
  try {
    return new RegExp(pattern).test(text);
  } catch {
    return text.includes(pattern);
  }
}

// 4단계(계좌간 이체 상쇄): 서로 다른 계좌 간 금액 일치·부호 반대·날짜 근접 쌍을 찾아
// raw_txn_id -> 짝 raw_txn_id 맵으로 반환한다. 이체는 손익이 아니므로 검토 화면에서
// 사용자가 한 번에 두 다리를 확인하고 하나의 대체 전표로 처리할 수 있도록 표시만 한다.
export function detectTransferPairs(rawTxns, windowDays = 3) {
  const pairMap = new Map();
  const list = rawTxns.filter((t) => t.status !== 'journalized' && t.status !== 'ignored');
  const used = new Set();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (used.has(a.raw_txn_id)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (used.has(b.raw_txn_id)) continue;
      if (a.fin_account_id === b.fin_account_id) continue;
      if (Math.abs(Number(a.amount)) !== Math.abs(Number(b.amount))) continue;
      if (Math.sign(Number(a.amount)) === Math.sign(Number(b.amount))) continue;
      const days = Math.abs((new Date(a.txn_date) - new Date(b.txn_date)) / 86400000);
      if (days > windowDays) continue;
      used.add(a.raw_txn_id);
      used.add(b.raw_txn_id);
      pairMap.set(a.raw_txn_id, b.raw_txn_id);
      pairMap.set(b.raw_txn_id, a.raw_txn_id);
      break;
    }
  }
  return pairMap;
}

// 복식 완성: 현금 다리(계좌의 GL계정)는 amount 부호로 이미 확정, 상대계정만 반대쪽에 채운다.
// amount>0(입금) → 차)GL계정 / 대)상대계정. amount<0(출금) → 차)상대계정 / 대)GL계정.
export function buildJournalLines(rawTxn, targetAccountId, linkedGlAccountId) {
  const amt = Math.abs(Number(rawTxn.amount));
  const glIsDebit = Number(rawTxn.amount) > 0;
  return [
    { account_id: linkedGlAccountId, debit_amount: glIsDebit ? amt : 0, credit_amount: glIsDebit ? 0 : amt, segment: null },
    { account_id: targetAccountId, debit_amount: glIsDebit ? 0 : amt, credit_amount: glIsDebit ? amt : 0, segment: null },
  ];
}
