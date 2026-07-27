import { supabase } from './supabaseClient.js';

export async function fetchAccounts({ activeOnly = false } = {}) {
  let q = supabase.from('accounts').select('*').order('account_code');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchFiscalYears() {
  const { data, error } = await supabase.from('fiscal_periods').select('fiscal_year').order('fiscal_year');
  if (error) throw error;
  return data.map((r) => r.fiscal_year);
}

export async function fetchPeriodIdForDate(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('period_id')
    .eq('fiscal_year', year)
    .maybeSingle();
  if (error) throw error;
  return data?.period_id ?? null;
}

// 특정 기준일(asOfDate) 시점의 시산표를 v_trial_balance와 동일한 형태로 반환한다.
// 자산·부채·자본(실질계정)은 기준일까지 전체 누적(개시분개가 그 이전 기간의 이월 잔액을
// 대신하므로 하한 없음), 수익·비용(명목계정)은 기준일이 속한 회계연도 시작일부터만 합산한다
// (그래야 매 회계연도마다 발생액이 자연스럽게 0부터 다시 집계됨 — 별도 마감 분개 없이도).
export async function fetchTrialBalance(asOfDate) {
  const accounts = await fetchAccounts();

  const { data: period, error: periodErr } = await supabase
    .from('fiscal_periods')
    .select('period_id, period_start, period_end, fiscal_year')
    .lte('period_start', asOfDate)
    .gte('period_end', asOfDate)
    .maybeSingle();
  if (periodErr) throw periodErr;

  const { data: lines, error } = await supabase
    .from('journal_lines')
    .select('account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status)')
    .eq('journal_entries.status', 'posted')
    .lte('journal_entries.entry_date', asOfDate);
  if (error) throw error;

  const accountById = new Map(accounts.map((a) => [a.account_id, a]));
  const byAccount = new Map();
  // 마감 분개 없이 당기순이익을 실시간 계산하는 설계라, 회계연도가 넘어가면
  // 이전 연도 수익·비용(명목계정)은 매 조회마다 0부터 다시 집계된다(아래 isNominal 하한 필터).
  // 그래서 미처분이익잉여금(이월) 계산에는 연도 경계 없이 asOfDate까지 전체 누적된 수익-비용
  // 합계가 별도로 필요하다 — 그게 누적순이익이다.
  let 누적순이익 = 0;
  for (const l of lines) {
    const acc = accountById.get(l.account_id);
    if (!acc) continue;
    const isNominal = acc.account_type === 'revenue' || acc.account_type === 'expense';
    // 수익(대변 증가)·비용(차변 증가) 모두 "대변-차변"이 그대로 손익 기여분이 된다
    // (비용의 정상잔액이 차변이라 차변 발생액이 자동으로 마이너스 기여가 됨).
    if (isNominal) {
      누적순이익 += Number(l.credit_amount) - Number(l.debit_amount);
    }
    if (isNominal && period && l.journal_entries.entry_date < period.period_start) continue;
    const cur = byAccount.get(l.account_id) ?? { total_debit: 0, total_credit: 0 };
    cur.total_debit += Number(l.debit_amount);
    cur.total_credit += Number(l.credit_amount);
    byAccount.set(l.account_id, cur);
  }

  const rows = accounts
    .filter((a) => byAccount.has(a.account_id))
    .map((a) => {
      const { total_debit, total_credit } = byAccount.get(a.account_id);
      return {
        account_id: a.account_id,
        account_code: a.account_code,
        account_name: a.account_name,
        account_type: a.account_type,
        total_debit,
        total_credit,
        balance: total_debit - total_credit,
      };
    });

  return { rows, period, accounts, 누적순이익 };
}
