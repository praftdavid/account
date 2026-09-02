import { esc, fmt } from './util.js';

const REVENUE_CATEGORY_LABEL = {
  매출: 'Ⅰ. 매출액',
  매출원가: 'Ⅱ. 매출원가',
  판매비와관리비: 'Ⅳ. 판매비와관리비',
  영업외수익: 'Ⅵ. 영업외수익',
  영업외비용: 'Ⅶ. 영업외비용',
  법인세: 'Ⅸ. 법인세등',
};

export function makeFlowFn(accounts, tb, overrides = {}) {
  const tbByAccount = new Map(tb.map((r) => [r.account_id, r]));
  return (accountId) => {
    if (overrides[accountId] !== undefined) return overrides[accountId];
    const row = tbByAccount.get(accountId);
    if (!row) return 0;
    const acc = accounts.find((a) => a.account_id === accountId);
    const dir = acc?.normal_balance === 'debit' ? 1 : -1;
    return dir * (Number(row.total_debit) - Number(row.total_credit));
  };
}

// 기초잔액(=회계연도 시작 시점 잔액)은 별도 개시분개/기초잔액 테이블이 없어 "기말잔액 - 이번
// 회계연도 중 변동분"으로 역산하는 방식을 쓴다(자본변동표·현금흐름표 공용). rawLines는 asOfDate까지
// posted된 journal_lines 전체를 화면에서 한 번만 불러와 여러 계정에 재사용하는 걸 전제로 한다.
// dir은 그 계정의 정상잔액 방향(차변=+1/대변=-1) — 이걸 곱해두면 반환값은 항상 "그 계정 정상잔액
// 기준 증가액"이 되어, 자산·부채·자본 어느 쪽이든 부호 해석이 일관된다.
export function changeInPeriod(rawLines, periodStart, accountId, dir) {
  return rawLines
    .filter((l) => l.account_id === accountId && periodStart && l.journal_entries.entry_date >= periodStart)
    .reduce((s, l) => s + dir * (Number(l.debit_amount) - Number(l.credit_amount)), 0);
}

// 자산·부채·자본(real account)의 "잔액"과 수익·비용(nominal account)의 "당기 발생액"은
// 둘 다 동일한 "정상잔액 방향으로 부호를 맞춘 debit-credit" 계산이라 flowOf 하나로 겸용한다.
export function subtreeTotal(accounts, flow, accountId) {
  const children = accounts.filter((a) => a.parent_account_id === accountId);
  if (!children.length) return flow(accountId);
  return children.reduce((s, c) => s + subtreeTotal(accounts, flow, c.account_id), 0);
}

export function renderSubtree(accounts, flow, accountId, depth = 0) {
  const acc = accounts.find((a) => a.account_id === accountId);
  const children = accounts
    .filter((a) => a.parent_account_id === accountId)
    .sort((a, b) => a.account_code.localeCompare(b.account_code));
  const amt = subtreeTotal(accounts, flow, accountId);
  const rows = [[`${'　'.repeat(depth)}${esc(acc.account_name)}`, amt, children.length > 0]];
  for (const c of children) rows.push(...renderSubtree(accounts, flow, c.account_id, depth + 1));
  return rows;
}

export function computeIncomeStatement(accounts, tb) {
  const flow = makeFlowFn(accounts, tb);

  const topCategories = accounts.filter((a) => !a.parent_account_id && (a.account_type === 'revenue' || a.account_type === 'expense'));
  const catByName = (name) => topCategories.find((t) => t.account_name === name);
  const childrenOf = (top) =>
    !top
      ? []
      : accounts.filter((a) => a.parent_account_id === top.account_id).sort((a, b) => a.account_code.localeCompare(b.account_code));
  const categoryTotal = (name) => childrenOf(catByName(name)).reduce((s, c) => s + flow(c.account_id), 0);
  const detail = (name) => childrenOf(catByName(name)).map((c) => [`　${esc(c.account_name)}`, flow(c.account_id), false]);
  const flowOf = (code) => {
    const acc = accounts.find((a) => a.account_code === code);
    return acc ? flow(acc.account_id) : 0;
  };

  const 매출액 = categoryTotal('매출');
  const 매출원가 = categoryTotal('매출원가');
  const 매출총이익 = 매출액 - 매출원가;
  // 이 회사는 사업부문이 상거래(상품매출 41001/원가 51001)와 증권투자(증권매매수익 41002·배당금수익
  // 41003/증권매매손실 51002) 둘로 뚜렷이 나뉘어서, 매출총이익 하나로 뭉뚱그리면 어느 쪽이 실적을
  // 견인했는지 안 보인다.
  const 상품매출손익 = flowOf('41001') - flowOf('51001');
  const 금융영업손익 = flowOf('41002') + flowOf('41003') - flowOf('51002');
  const 판관비 = categoryTotal('판매비와관리비');
  const 영업이익 = 매출총이익 - 판관비;
  const 영업외수익 = categoryTotal('영업외수익');
  const 영업외비용 = categoryTotal('영업외비용');
  const 세전이익 = 영업이익 + 영업외수익 - 영업외비용;
  const 법인세 = categoryTotal('법인세');
  const 당기순이익 = 세전이익 - 법인세;

  const rows = [
    [REVENUE_CATEGORY_LABEL.매출, 매출액, true],
    ...detail('매출'),
    [REVENUE_CATEGORY_LABEL.매출원가, 매출원가, true],
    ...detail('매출원가'),
    ['Ⅲ. 매출총이익', 매출총이익, true],
    ['　상품매출손익', 상품매출손익, false],
    ['　금융영업손익', 금융영업손익, false],
    [REVENUE_CATEGORY_LABEL.판매비와관리비, 판관비, true],
    ...detail('판매비와관리비'),
    ['Ⅴ. 영업이익', 영업이익, true],
    [REVENUE_CATEGORY_LABEL.영업외수익, 영업외수익, true],
    ...detail('영업외수익'),
    [REVENUE_CATEGORY_LABEL.영업외비용, 영업외비용, true],
    ...detail('영업외비용'),
    ['Ⅷ. 법인세차감전순이익', 세전이익, true],
    [REVENUE_CATEGORY_LABEL.법인세, 법인세, false],
    ['Ⅹ. 당기순이익', 당기순이익, true],
  ];

  return { rows, 당기순이익 };
}

export function statementHtml(title, note, rows, { tableId, exportBtnId } = {}) {
  const body = rows
    .map(([label, amt, bold]) => `<tr class="${bold ? 'sec' : ''}"><td>${label}</td><td class="num">${amt === null ? '' : fmt(amt)}</td></tr>`)
    .join('');
  const heading = exportBtnId
    ? `<div class="toolbar"><h2 style="flex:1">${esc(title)}</h2><button type="button" class="btn ghost sm" id="${exportBtnId}">엑셀 다운로드</button></div>`
    : `<h2>${esc(title)}</h2>`;
  return `<div class="card statement">${heading}${note ? `<p class="note" style="margin:-6px 0 12px">${esc(note)}</p>` : ''}
  <table${tableId ? ` id="${tableId}"` : ''}><tr><th style="text-align:left">과목</th><th>금액</th></tr>${body}</table></div>`;
}
