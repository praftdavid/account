import { supabase } from './lib/supabaseClient.js';
import { renderLogin } from './pages/login.js';
import { renderAccounts } from './pages/accounts.js';
import { renderJournalEntry } from './pages/journalEntry.js';
import { renderJournalList } from './pages/journalList.js';
import { renderTrialBalance } from './pages/trialBalance.js';
import { renderLedger } from './pages/ledger.js';
import { renderIncomeStatement } from './pages/incomeStatement.js';
import { renderBalanceSheet } from './pages/balanceSheet.js';
import { renderRetainedEarnings } from './pages/retainedEarnings.js';
import { renderEquityChanges } from './pages/equityChanges.js';
import { renderCashFlow } from './pages/cashFlow.js';
import { renderFinancialAccounts } from './pages/financialAccounts.js';
import { renderImportTransactions } from './pages/importTransactions.js';
import { renderReviewTransactions } from './pages/reviewTransactions.js';
import { renderBalanceSnapshots } from './pages/balanceSnapshots.js';
import { renderSecuritiesReview } from './pages/securitiesReview.js';
import { renderSecuritiesValuation } from './pages/securitiesValuation.js';
import { renderSecuritiesPositions } from './pages/securitiesPositions.js';
import { renderSecuritiesTrades } from './pages/securitiesTrades.js';
import { renderSecuritiesDividends } from './pages/securitiesDividends.js';
import { renderSecuritiesFx } from './pages/securitiesFx.js';
import { renderSecuritiesFxRates } from './pages/securitiesFxRates.js';
import { renderTaxComputation } from './pages/taxComputation.js';
import { renderTaxAdjustments } from './pages/taxAdjustments.js';
import { renderTaxReserves } from './pages/taxReserves.js';
import { renderTaxCredits } from './pages/taxCredits.js';
import { renderDashboard } from './pages/dashboard.js';
import { esc } from './lib/util.js';

// 메뉴 배치 원칙:
//  1. 회계 데이터 흐름 순서 — 기초정보(설정) → 자동분개(입력 자동화) → 전표·장부(기록) →
//     재무제표(보고) → 법인세(신고). 상류에서 하류로 흘러가는 순서 그대로 배치한다.
//  2. 범용 사이클 vs 도메인 특화 모듈 분리 — 위 5개 그룹은 어떤 사업이든 공통인 "범용 회계 사이클"이고,
//     "증권관리"는 이 회사 투자 부문 전용 분석 모듈(향후 수익률분석·리밸런싱까지 확장 예정)이라 성격이
//     다르다. 범용 사이클이 끝난 뒤 부가 모듈로 맨 뒤에 둔다.
//  3. 쓰기(액션)와 읽기(조회) 분리 — 분개생성 액션은 전부 "자동분개"/"전표·장부"에 모으고,
//     "증권관리"는 조회·분석 전용으로 완전히 분리한다.
//  4. 그룹 "내부" 정렬은 그룹 성격에 따라 다르다 — "처리형" 그룹(자동분개·전표·장부)은 실제 업무가
//     처리되는 순서(예: 거래 업로드 → 검토·분개 → 잔액 대사 → 주기적 마감 작업)로, "리포트형" 그룹
//     (재무제표·법인세·증권관리)은 요약(대시보드) 화면을 먼저 두고 그 뒤에 지원 상세 화면을 둔다.
//     예: "증권 재평가"는 반기/연말 잔고증명서가 왔을 때만 하는 주기적 마감 작업이라, 일상적인
//     거래 처리·대사가 다 끝난 뒤(잔액 대사 다음)에 오는 게 맞다.
const GROUPS = [
  [
    'home',
    '대시보드',
    [['dashboard', '대시보드', renderDashboard]],
  ],
  [
    'base',
    '기초정보',
    [
      ['accounts', '계정과목', renderAccounts],
      ['finAccounts', '계좌 관리', renderFinancialAccounts],
    ],
  ],
  [
    'auto',
    '자동분개',
    [
      ['import', '거래 업로드', renderImportTransactions],
      ['review', '거래 검토·분개', renderReviewTransactions],
      ['secReview', '증권 거래 분개', renderSecuritiesReview],
      ['snapshots', '잔액 대사', renderBalanceSnapshots],
      ['secValuation', '증권 재평가', renderSecuritiesValuation],
    ],
  ],
  [
    'daily',
    '전표·장부',
    [
      ['entry', '분개 입력', renderJournalEntry],
      ['journal', '분개장', renderJournalList],
      ['ledger', '계정별원장', renderLedger],
      ['tb', '시산표', renderTrialBalance],
    ],
  ],
  [
    'stmt',
    '재무제표',
    [
      ['bs', '재무상태표', renderBalanceSheet],
      ['pl', '손익계산서', renderIncomeStatement],
      ['re', '이익잉여금처분계산서', renderRetainedEarnings],
      ['eq', '자본변동표', renderEquityChanges],
      ['cf', '현금흐름표', renderCashFlow],
    ],
  ],
  [
    'tax',
    '법인세',
    [
      ['taxCalc', '법인세 계산', renderTaxComputation],
      ['taxAdj', '소득금액조정합계표', renderTaxAdjustments],
      ['taxRes', '유보 관리', renderTaxReserves],
      ['taxCr', '기납부세액 · 세액공제', renderTaxCredits],
    ],
  ],
  [
    'securities',
    '증권관리',
    [
      ['secPositions', '보유종목 현황', renderSecuritiesPositions],
      ['secTrades', '매매내역', renderSecuritiesTrades],
      ['secDividends', '배당금내역', renderSecuritiesDividends],
      ['secFx', '환전내역', renderSecuritiesFx],
      ['secFxRates', '환율(거래일 대사)', renderSecuritiesFxRates],
    ],
  ],
];

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const userbarEl = document.getElementById('userbar');
const homeLinkEl = document.getElementById('homeLink');
if (homeLinkEl) homeLinkEl.onclick = () => go('dashboard');

let session = null;
let cur = 'dashboard';

function groupOf(view) {
  return GROUPS.find((g) => g[2].some((v) => v[0] === view));
}

function go(view) {
  cur = view;
  render();
}

async function render() {
  if (!session) {
    navEl.innerHTML = '';
    userbarEl.innerHTML = '';
    renderLogin(mainEl);
    return;
  }

  userbarEl.innerHTML = `<span>${esc(session.user.email)}</span><button class="btn ghost sm" id="logoutBtn">로그아웃</button>`;
  document.getElementById('logoutBtn').onclick = () => supabase.auth.signOut();

  const curGroup = groupOf(cur) ?? GROUPS[0];

  navEl.innerHTML = `
    <div class="nav-row nav-groups">${GROUPS.map(([k, label]) => `<button class="${k === curGroup[0] ? 'on' : ''}" data-group="${k}">${label}</button>`).join('')}</div>
    ${curGroup[2].length > 1 ? `<div class="nav-row nav-items">${curGroup[2].map(([k, label]) => `<button class="${k === cur ? 'on' : ''}" data-view="${k}">${label}</button>`).join('')}</div>` : ''}`;

  navEl.querySelectorAll('[data-group]').forEach((b) => {
    b.onclick = () => {
      const g = GROUPS.find((gr) => gr[0] === b.dataset.group);
      go(g[2][0][0]);
    };
  });
  navEl.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => go(b.dataset.view)));

  const view = curGroup[2].find((v) => v[0] === cur);
  mainEl.innerHTML = '<p class="note">불러오는 중…</p>';
  try {
    await view[2](mainEl);
  } catch (err) {
    mainEl.innerHTML = `<div class="card"><p class="err">오류: ${esc(err.message ?? String(err))}</p></div>`;
  }
}

supabase.auth.getSession().then(({ data }) => {
  session = data.session;
  render();
});

supabase.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  if (!session) cur = 'dashboard';
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
