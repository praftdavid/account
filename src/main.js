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
import { renderFinancialAccounts } from './pages/financialAccounts.js';
import { renderImportTransactions } from './pages/importTransactions.js';
import { renderReviewTransactions } from './pages/reviewTransactions.js';
import { renderBalanceSnapshots } from './pages/balanceSnapshots.js';
import { renderSecuritiesReview } from './pages/securitiesReview.js';
import { renderSecuritiesPositions } from './pages/securitiesPositions.js';
import { renderSecuritiesTrades } from './pages/securitiesTrades.js';
import { renderSecuritiesDividends } from './pages/securitiesDividends.js';
import { renderSecuritiesFx } from './pages/securitiesFx.js';
import { renderTaxComputation } from './pages/taxComputation.js';
import { renderTaxAdjustments } from './pages/taxAdjustments.js';
import { renderTaxReserves } from './pages/taxReserves.js';
import { renderTaxCredits } from './pages/taxCredits.js';
import { esc } from './lib/util.js';

// 더존 등 실무 회계프로그램 관례: 계정과목(기초정보) / 전표·장부(일상 처리) / 재무제표(공식 보고서) 3단 분류.
// "증권관리"는 조회·분석 전용(분개생성 없음) — 분개생성 액션은 전부 "자동분개" 그룹에 모은다.
const GROUPS = [
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
    'securities',
    '증권관리',
    [
      ['secPositions', '보유종목 현황', renderSecuritiesPositions],
      ['secTrades', '매매내역', renderSecuritiesTrades],
      ['secDividends', '배당금내역', renderSecuritiesDividends],
      ['secFx', '환전내역', renderSecuritiesFx],
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
];

const navEl = document.getElementById('nav');
const mainEl = document.getElementById('main');
const userbarEl = document.getElementById('userbar');

let session = null;
let cur = 'accounts';

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
    <div class="nav-row nav-items">${curGroup[2].map(([k, label]) => `<button class="${k === cur ? 'on' : ''}" data-view="${k}">${label}</button>`).join('')}</div>`;

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
  if (!session) cur = 'accounts';
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
