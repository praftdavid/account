import { fetchTrialBalance } from '../lib/data.js';
import { makeFlowFn, subtreeTotal, computeIncomeStatement } from '../lib/statements.js';
import { esc, fmt, todayStr } from '../lib/util.js';

// 대시보드 — 로그인 후 첫 화면. 다른 화면과 달리 여러 도메인(재무제표·증권)을 가로질러 요약만
// 보여주는 조회 전용 화면이라 별도 최상위 그룹으로 둔다(메뉴 원칙 #2의 "범용 사이클 vs 도메인 특화"와
// 또 다르게, 이건 그 자체가 요약 진입점이라 아예 그 앞에 위치).
//
// "계좌별 현금비중"은 일부러 넣지 않았다 — 국민은행·키움2843·키움2845 실물계좌 3개가 전부 같은
// GL계정(11101 보통예금) 하나에 연결돼 있어서, 원장만으로는 그 잔액이 계좌별로 얼마씩인지 나눌 수
// 없다(raw_transactions도 국민은행은 파이프라인 미가동으로 데이터가 아예 없고, 키움 쪽은 원화가 아닌
// 외화예수금 잔액만 부분적으로 잡혀 있어 원화 총액과 다른 숫자다). 실제로 못 나누는 걸 그럴듯하게
// 지어내는 대신, 전체 합계만 보여주고 이유를 각주로 남긴다.

// 오늘 기준 가장 최근 반기말(6/30·12/31)부터 거슬러 올라가며 n개를 뽑아 오래된 순으로 반환한다
// (반기 재평가와 같은 규칙 — 미래·현재 진행 중인 반기는 아직 마감 전이라 제외).
function recentHalfYearEnds(n, today) {
  const candidates = [];
  const startYear = Number(today.slice(0, 4));
  for (let year = startYear; candidates.length < n + 2; year--) {
    candidates.push(`${year}-12-31`, `${year}-06-30`);
  }
  return candidates.filter((d) => d <= today).slice(0, n).reverse();
}

// 기준일 시점의 부채·자본 총계 — 재무상태표(balanceSheet.js)와 동일하게, 마감분개 없이 실시간
// 계산하는 이 시스템 특성상 미처분이익잉여금에 누적순이익(전기 이전분 포함)을 얹어야 대차가 맞는다.
async function assetStructureAt(date) {
  const { rows: tb, accounts, 누적순이익 } = await fetchTrialBalance(date);
  const baseFlow = makeFlowFn(accounts, tb);
  const retained = accounts.find((a) => a.account_code === '35001');
  const overrides = retained ? { [retained.account_id]: baseFlow(retained.account_id) + 누적순이익 } : {};
  const flow = makeFlowFn(accounts, tb, overrides);
  const liabRoot = accounts.find((a) => a.account_code === '20000');
  const equityRoot = accounts.find((a) => a.account_code === '30000');
  const 부채 = liabRoot ? subtreeTotal(accounts, flow, liabRoot.account_id) : 0;
  const 자본 = equityRoot ? subtreeTotal(accounts, flow, equityRoot.account_id) : 0;
  return { date, 부채, 자본 };
}

export async function renderDashboard(container) {
  const today = todayStr();
  let tb, accounts, period;
  try {
    ({ rows: tb, accounts, period } = await fetchTrialBalance(today));
  } catch (err) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(err.message)}</p></div>`;
    return;
  }

  const flow = makeFlowFn(accounts, tb);
  const idOf = (code) => accounts.find((a) => a.account_code === code)?.account_id;
  const assetRoot = accounts.find((a) => a.account_code === '10000');
  const 자산총계 = assetRoot ? subtreeTotal(accounts, flow, assetRoot.account_id) : 0;
  const 현금성자산 = idOf('11101') ? flow(idOf('11101')) : 0;
  const 증권평가금액 = idOf('11104') ? flow(idOf('11104')) : 0;
  const { 당기순이익 } = computeIncomeStatement(accounts, tb);

  const halfYearEnds = recentHalfYearEnds(6, today);
  const structureRows = await Promise.all(halfYearEnds.map(assetStructureAt));

  const CHART_H = 140;
  const maxTotal = Math.max(1, ...structureRows.map((r) => r.부채 + r.자본));
  const chartCols = structureRows
    .map((r) => {
      const total = r.부채 + r.자본;
      const 부채h = Math.round((Math.max(0, r.부채) / maxTotal) * CHART_H);
      const 자본h = Math.round((Math.max(0, r.자본) / maxTotal) * CHART_H);
      const label = `${r.date.slice(2, 4)}.${r.date.slice(5, 7)}`;
      return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:44px">
        <div style="font-size:10px;color:#666;margin-bottom:4px;white-space:nowrap">${fmt(total)}</div>
        <div style="display:flex;flex-direction:column-reverse;justify-content:flex-start;height:${CHART_H}px;width:28px;background:#f5f6fa;border-radius:3px 3px 0 0;overflow:hidden">
          <div style="height:${부채h}px;background:var(--navy)"></div>
          <div style="height:${자본h}px;background:var(--blue);opacity:.55"></div>
        </div>
        <div style="font-size:11px;color:#555;margin-top:6px">${label}</div>
      </div>`;
    })
    .join('');

  container.innerHTML = `
  <div class="grid">
    <div class="kpi"><div class="t">자산총계</div><div class="v">${fmt(자산총계)}</div></div>
    <div class="kpi"><div class="t">현금성자산 (보통예금 합계)</div><div class="v">${fmt(현금성자산)}</div></div>
    <div class="kpi"><div class="t">증권평가금액 (매도가능증권)</div><div class="v">${fmt(증권평가금액)}</div></div>
    <div class="kpi"><div class="t">당기순이익 (${period ? period.period_start + '~' + today : today})</div><div class="v">${fmt(당기순이익)}</div></div>
  </div>

  <div class="card">
    <h2>자산규모 추이 (최근 ${Math.round(structureRows.length / 2)}개년)</h2>
    <div style="display:flex;align-items:flex-end;gap:10px;overflow-x:auto;padding-top:8px">${chartCols}</div>
    <p class="note"><span style="display:inline-block;width:10px;height:10px;background:var(--navy);margin-right:4px;vertical-align:-1px"></span>부채
    &nbsp;&nbsp;<span style="display:inline-block;width:10px;height:10px;background:var(--blue);opacity:.55;margin-right:4px;vertical-align:-1px"></span>자본
    &nbsp;&nbsp;막대 전체 높이 = 자산총계(부채+자본). 회사 설립 이전 반기는 자연히 0으로 표시됩니다.</p>
  </div>

  <div class="card">
    <p class="note">"계좌별 현금비중"은 아직 제공하지 않습니다 — 국민은행·키움2843·키움2845 실물계좌 3개가 전부 같은 GL계정(11101 보통예금)에 연결돼 있어 원장 데이터만으로는 계좌별 잔액을 나눌 수 없습니다(국민은행은 자동분개 파이프라인이 아직 검증 전이라 원시 거래 데이터 자체가 없고, 키움 쪽은 원화가 아닌 외화예수금 일부만 추적됨). 계좌관리 파이프라인이 더 갖춰지면 추가할 예정입니다.</p>
  </div>`;
}
