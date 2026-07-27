import { esc } from './util.js';

export const CATEGORY_LABEL = { asset: '자산', liability: '부채', equity: '자본', revenue: '수익', expense: '비용' };
export const CATEGORY_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

// 말단(하위) 계정만 실제 분개가 찍히므로 선택 대상도 말단 계정으로 좁힌다.
export function leafAccounts(accounts, type) {
  const hasChild = new Set(accounts.map((a) => a.parent_account_id).filter(Boolean));
  return accounts.filter((a) => a.account_type === type && !hasChild.has(a.account_id));
}

// 대분류 선택 후 하위 계정을 한번 더 좁혀 고를 수 있도록, 직계 부모 이름으로 묶어 optgroup을 만든다.
export function groupByParent(accounts, leaves) {
  const accById = new Map(accounts.map((a) => [a.account_id, a]));
  const groups = new Map();
  for (const a of leaves) {
    const parentName = accById.get(a.parent_account_id)?.account_name ?? '기타';
    if (!groups.has(parentName)) groups.set(parentName, []);
    groups.get(parentName).push(a);
  }
  for (const list of groups.values()) list.sort((x, y) => x.account_code.localeCompare(y.account_code));
  return groups;
}

export function categoryOptionsHtml(selectedType) {
  return CATEGORY_ORDER.map((t) => `<option value="${t}" ${t === selectedType ? 'selected' : ''}>${CATEGORY_LABEL[t]}</option>`).join('');
}

// placeholder=true면 맨 앞에 "(계정 선택)" 빈 옵션을 추가한다(수기 분개 입력처럼 미선택 허용 시).
export function accountOptionsHtml(accounts, leaves, selectedAccountId, { placeholder = false } = {}) {
  const groups = groupByParent(accounts, leaves);
  const groupsHtml = [...groups.entries()]
    .map(
      ([parentName, list]) =>
        `<optgroup label="${esc(parentName)}">${list
          .map((a) => `<option value="${a.account_id}" ${a.account_id === selectedAccountId ? 'selected' : ''}>${esc(a.account_code)} ${esc(a.account_name)}</option>`)
          .join('')}</optgroup>`
    )
    .join('');
  return (placeholder ? `<option value="">(계정 선택)</option>` : '') + groupsHtml;
}
