import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchPeriodIdForDate, fetchMaxEntryNo, formatEntryNo } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';
import { CATEGORY_ORDER, leafAccounts, categoryOptionsHtml, accountOptionsHtml } from '../lib/accountPicker.js';
import { suggestAccount, detectTransferPairs, buildJournalLines } from '../lib/autoJournal.js';

let selectedFinAccountId = null;

export async function renderReviewTransactions(container) {
  const [{ data: finAccounts, error: finErr }, accounts] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('is_active', true).order('fin_account_id'),
    fetchAccounts({ activeOnly: true }),
  ]);
  if (finErr) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(finErr.message)}</p></div>`;
    return;
  }

  if (!selectedFinAccountId && finAccounts.length) selectedFinAccountId = finAccounts[0].fin_account_id;
  const account = finAccounts.find((a) => a.fin_account_id === selectedFinAccountId);

  const acctOptions = finAccounts
    .map((a) => `<option value="${a.fin_account_id}" ${a.fin_account_id === selectedFinAccountId ? 'selected' : ''}>${esc(a.institution_name)}${a.account_no_masked ? ` (${esc(a.account_no_masked)})` : ''}</option>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>거래 검토·분개</h2>
    <div class="toolbar">
      <label>계좌: </label>
      <select id="revAcct">${acctOptions || '<option>등록된 계좌 없음</option>'}</select>
    </div>
    <div id="revBody"><p class="note">불러오는 중…</p></div>
  </div>`;

  document.getElementById('revAcct').addEventListener('change', (ev) => {
    selectedFinAccountId = Number(ev.target.value);
    renderReviewTransactions(container);
  });

  if (!account) return;
  const body = document.getElementById('revBody');

  const [{ data: allTxns, error: txnErr }, { data: mappingRules }] = await Promise.all([
    supabase
      .from('raw_transactions')
      .select('*')
      .eq('fin_account_id', account.fin_account_id)
      .neq('status', 'ignored')
      .order('txn_date'),
    supabase.from('mapping_rules').select('*'),
  ]);
  if (txnErr) {
    body.innerHTML = `<p class="err">거래 조회 실패: ${esc(txnErr.message)}</p>`;
    return;
  }

  const pending = allTxns.filter((t) => t.status !== 'journalized');
  const transferMap = detectTransferPairs(allTxns);

  if (!pending.length) {
    body.innerHTML = '<p class="note">검토할 거래가 없습니다. [거래 업로드] 화면에서 먼저 파일을 올려주세요.</p>';
    return;
  }

  const rows = pending
    .map((t) => {
      const suggested = suggestAccount(t, mappingRules ?? []);
      const defaultCategory = suggested ? accounts.find((a) => a.account_id === suggested)?.account_type : Number(t.amount) > 0 ? 'revenue' : 'expense';
      const leaves = leafAccounts(accounts, defaultCategory ?? CATEGORY_ORDER[0]);
      const isTransfer = transferMap.has(t.raw_txn_id);
      return `<tr data-txn="${t.raw_txn_id}">
        <td><input type="checkbox" class="rowChk" checked></td>
        <td class="c">${esc(t.txn_date)}</td>
        <td>${esc(t.memo ?? '')}${isTransfer ? ' <span class="badge draft">계좌간이체 추정</span>' : ''}</td>
        <td class="num">${Number(t.amount) > 0 ? fmt(t.amount) : ''}</td>
        <td class="num">${Number(t.amount) < 0 ? fmt(-t.amount) : ''}</td>
        <td>
          <select class="rowCat">${categoryOptionsHtml(defaultCategory ?? CATEGORY_ORDER[0])}</select>
          <select class="rowAcct">${accountOptionsHtml(accounts, leaves, suggested, { placeholder: true })}</select>
        </td>
        <td class="c">${t.status === 'journalized' ? '<span class="badge ok">분개완료</span>' : suggested ? '<span class="badge draft">제안됨</span>' : ''}</td>
      </tr>`;
    })
    .join('');

  body.innerHTML = `
    <div class="toolbar">
      <span class="note">${pending.length}건 검토 대기</span>
      <button class="btn" id="revGenerate">선택 건 분개 생성</button>
      <span class="err" id="revErr"></span>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th></th><th>일자</th><th>적요</th><th>입금</th><th>출금</th><th>상대계정</th><th></th></tr>
      ${rows}
    </table></div>`;

  body.querySelectorAll('.rowCat').forEach((sel) => {
    sel.addEventListener('change', (ev) => {
      const tr = ev.target.closest('tr');
      const acctSel = tr.querySelector('.rowAcct');
      acctSel.innerHTML = accountOptionsHtml(accounts, leafAccounts(accounts, ev.target.value), null, { placeholder: true });
    });
  });

  document.getElementById('revGenerate').onclick = async () => {
    const btn = document.getElementById('revGenerate');
    const errEl = document.getElementById('revErr');
    btn.disabled = true;
    errEl.textContent = '';

    const selectedRows = [...body.querySelectorAll('tr[data-txn]')].filter((tr) => tr.querySelector('.rowChk').checked);
    let created = 0;
    let skipped = 0;
    const entryNoCache = {}; // fiscalYear -> 다음에 쓸 전표번호(정수). 배치 안에서 매번 다시 조회하지 않게 캐시.

    for (const tr of selectedRows) {
      const rawTxnId = Number(tr.dataset.txn);
      const txn = pending.find((t) => t.raw_txn_id === rawTxnId);
      const targetAccountId = Number(tr.querySelector('.rowAcct').value) || null;
      if (!txn || !targetAccountId || txn.status === 'journalized') {
        skipped++;
        continue;
      }

      let periodId;
      try {
        periodId = await fetchPeriodIdForDate(txn.txn_date);
      } catch {
        skipped++;
        continue;
      }
      if (!periodId) {
        skipped++;
        continue;
      }

      const fiscalYear = Number(txn.txn_date.slice(0, 4));
      if (entryNoCache[fiscalYear] === undefined) {
        try {
          entryNoCache[fiscalYear] = await fetchMaxEntryNo(fiscalYear);
        } catch {
          entryNoCache[fiscalYear] = null;
        }
      }
      const entryNo = entryNoCache[fiscalYear] === null ? null : formatEntryNo(++entryNoCache[fiscalYear]);

      const { data: entry, error: e1 } = await supabase
        .from('journal_entries')
        .insert({
          entry_no: entryNo,
          entry_date: txn.txn_date,
          period_id: periodId,
          description: txn.memo,
          source_type: 'auto',
          source_transaction_id: rawTxnId,
          status: 'draft',
        })
        .select()
        .single();
      if (e1) {
        skipped++;
        continue;
      }

      const lines = buildJournalLines(txn, targetAccountId, account.linked_gl_account_id).map((l) => ({ ...l, entry_id: entry.entry_id }));
      const { error: e2 } = await supabase.from('journal_lines').insert(lines);
      if (e2) {
        await supabase.from('journal_entries').delete().eq('entry_id', entry.entry_id);
        skipped++;
        continue;
      }

      await supabase.from('raw_transactions').update({ status: 'journalized', generated_entry_id: entry.entry_id }).eq('raw_txn_id', rawTxnId);

      // 사용자가 고른 상대계정을 규칙으로 학습(다음번 같은 적요는 자동 제안).
      if (txn.memo) {
        await supabase.from('mapping_rules').insert({
          match_type: 'memo',
          match_pattern: escapeRegex(txn.memo),
          target_account_id: targetAccountId,
          fin_account_scope: account.fin_account_id,
          priority: 50,
        });
      }

      created++;
    }

    btn.disabled = false;
    alert(`분개 ${created}건 생성됨(draft)${skipped ? `, ${skipped}건 건너뜀` : ''}. [분개장]에서 확인 후 전기(승인)하세요.`);
    renderReviewTransactions(container);
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
