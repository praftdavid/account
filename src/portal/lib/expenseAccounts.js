import { supabase } from '../../lib/supabaseClient.js';

// 지급회의서의 계정과목 선택란은 새 테이블을 안 만들고 회계 시스템의 accounts 테이블을
// 그대로 조회한다(같은 Supabase 프로젝트) — 문서포털과 회계 시스템이 여기서 연결된다.
export async function fetchExpenseAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('account_id,account_code,account_name')
    .eq('account_type', 'expense')
    .eq('is_active', true)
    .order('account_code');
  if (error) throw error;
  return data;
}

export function accountLabel(accounts, accountId) {
  const a = accounts.find((x) => x.account_id === accountId);
  return a ? `${a.account_code} ${a.account_name}` : '';
}
