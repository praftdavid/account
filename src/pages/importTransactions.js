import { supabase } from '../lib/supabaseClient.js';
import { esc, fmt } from '../lib/util.js';
import { dedupKey } from '../lib/autoJournal.js';
import { securitiesDedupKey } from '../lib/securitiesJournal.js';
import { parseKbBank } from '../lib/parsers/kbBank.js';
import { parseKiwoomPdf } from '../lib/parsers/kiwoomPdf.js';
import { parseKiwoomCsv } from '../lib/parsers/kiwoomCsv.js';

let selectedFinAccountId = null;
let parsed = null; // 파싱 결과 미리보기(확정 전)
let parseError = null;

// 확장자만으로는 부족하다 — 키움 연도별 통합내역도 .xlsx로 나오므로 계좌 구분(은행/증권)과
// 함께 봐야 국민은행용 .xls와 헷갈리지 않는다.
function pickParser(account, filename) {
  const ext = filename.toLowerCase().split('.').pop();
  if (account.account_kind === 'bank') {
    if (ext === 'xls' || ext === 'xlsx') return parseKbBank;
    return null;
  }
  // securities
  if (ext === 'pdf') return parseKiwoomPdf;
  if (ext === 'csv') return parseKiwoomCsv;
  return null;
}

export async function renderImportTransactions(container) {
  const { data: finAccounts, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .eq('is_active', true)
    .order('fin_account_id');

  if (error) {
    container.innerHTML = `<div class="card"><p class="err">계좌 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  if (!selectedFinAccountId && finAccounts.length) selectedFinAccountId = finAccounts[0].fin_account_id;
  const account = finAccounts.find((a) => a.fin_account_id === selectedFinAccountId);

  const acctOptions = finAccounts
    .map((a) => `<option value="${a.fin_account_id}" ${a.fin_account_id === selectedFinAccountId ? 'selected' : ''}>${esc(a.institution_name)}${a.account_no_masked ? ` (${esc(a.account_no_masked)})` : ''}</option>`)
    .join('');

  const previewRows = (parsed?.cash ?? [])
    .map(
      (t) => `<tr>
        <td class="c">${esc(t.txn_date)}</td>
        <td>${esc(t.memo)}</td>
        <td class="num">${t.amount > 0 ? fmt(t.amount) : ''}</td>
        <td class="num">${t.amount < 0 ? fmt(-t.amount) : ''}</td>
        <td class="num">${fmt(t.balance_after)}</td>
      </tr>`
    )
    .join('');

  const secPreviewRows = (parsed?.securities ?? [])
    .map((s) => {
      if (s.kind === 'trade') {
        return `<tr>
          <td class="c">${esc(s.txn_date)}</td>
          <td>${s.side === 'buy' ? '매수' : '매도'}</td>
          <td>${esc(s.name || s.ticker)}</td>
          <td class="num">${fmt(s.quantity)}</td>
          <td class="num">${fmt(s.unit_price_usd)}</td>
          <td class="num">${fmt(s.fee_usd)}</td>
          <td class="c">${s.currency}</td>
        </tr>`;
      }
      return `<tr>
        <td class="c">${esc(s.txn_date)}</td>
        <td>배당</td>
        <td>${esc(s.name || s.ticker)}</td>
        <td class="num"></td>
        <td class="num">${fmt(s.gross_usd)}</td>
        <td class="num">${fmt(s.tax_usd)}</td>
        <td class="c">${s.currency}</td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>거래내역 업로드</h2>
    <div class="toolbar">
      <label>계좌: </label>
      <select id="impAcct">${acctOptions || '<option>등록된 계좌 없음</option>'}</select>
      <input type="file" id="impFile" accept=".xls,.xlsx,.pdf,.csv">
    </div>
    <p class="note">국민은행 계좌는 .xls, 키움증권 계좌는 종합거래내역 .pdf 또는 월중 거래내역 .csv 파일을 올려주세요.</p>
    ${parseError ? `<p class="err">${esc(parseError)}</p>` : ''}
    <div id="importBody"></div>
  </div>`;

  document.getElementById('impAcct').addEventListener('change', (ev) => {
    selectedFinAccountId = Number(ev.target.value);
    parsed = null;
    parseError = null;
    renderImportTransactions(container);
  });

  document.getElementById('impFile').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    parseError = null;
    parsed = null;
    const parser = pickParser(account, file.name);
    if (!parser) {
      parseError = account.account_kind === 'bank'
        ? '이 계좌(은행)는 .xls/.xlsx만 지원합니다.'
        : '이 계좌(증권)는 .pdf(종합거래내역) 또는 .csv(월중 거래내역)만 지원합니다.';
      renderImportTransactions(container);
      return;
    }
    const body = document.getElementById('importBody');
    body.innerHTML = '<p class="note">파싱 중…</p>';
    try {
      const raw = await parser(file);
      // parseKbBank는 현금 이벤트만 있는 flat 배열, 키움 파서는 {cash, securities} 반환.
      parsed = Array.isArray(raw) ? { cash: raw, securities: [] } : raw;
      parsed._filename = file.name;
    } catch (err) {
      parseError = '파싱 실패: ' + err.message;
    }
    renderImportTransactions(container);
  });

  const body = document.getElementById('importBody');
  const cashRows = parsed?.cash ?? [];
  const secRows = parsed?.securities ?? [];
  if (!parsed || (!cashRows.length && !secRows.length)) {
    if (!parseError) body.innerHTML = '';
    return;
  }

  const totalIn = cashRows.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0);
  const totalOut = cashRows.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0);

  body.innerHTML = `
    <div class="toolbar">
      <span class="note">현금 ${cashRows.length}건(입금 ${fmt(totalIn)} · 출금 ${fmt(totalOut)})${secRows.length ? ` · 증권거래/배당 ${secRows.length}건` : ''}</span>
      <button class="btn" id="impConfirm">가져오기</button>
      <span class="err" id="impErr"></span>
    </div>
    ${cashRows.length ? `<div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>적요</th><th>입금</th><th>출금</th><th>잔액</th></tr>
      ${previewRows}
    </table></div>` : ''}
    ${secRows.length ? `<p class="note" style="margin-top:12px">증권 매수·매도·배당 (아래 건은 [자동분개 &gt; 증권 거래 분개] 화면에서 분개 생성)</p>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>구분</th><th>종목</th><th>수량</th><th>단가/총액</th><th>수수료/세금</th><th>통화</th></tr>
      ${secPreviewRows}
    </table></div>` : ''}`;

  document.getElementById('impConfirm').onclick = async () => {
    const btn = document.getElementById('impConfirm');
    const errEl = document.getElementById('impErr');
    btn.disabled = true;
    errEl.textContent = '';

    const { data: batch, error: batchErr } = await supabase
      .from('import_batches')
      .insert({ fin_account_id: account.fin_account_id, source_filename: parsed._filename ?? null, row_count: cashRows.length + secRows.length })
      .select()
      .single();
    if (batchErr) {
      errEl.textContent = '가져오기 실패: ' + batchErr.message;
      btn.disabled = false;
      return;
    }

    const seenKeys = new Map();
    const rows = cashRows.map((t) => {
      const baseKey = `${account.fin_account_id}|${t.txn_date}|${t.amount}|${(t.memo ?? '').slice(0, 40)}`;
      const seq = seenKeys.get(baseKey) ?? 0;
      seenKeys.set(baseKey, seq + 1);
      return {
        fin_account_id: account.fin_account_id,
        import_batch_id: batch.import_batch_id,
        txn_date: t.txn_date,
        amount: t.amount,
        memo: t.memo,
        balance_after: t.balance_after,
        dedup_key: dedupKey(account.fin_account_id, t.txn_date, t.amount, t.memo, seq),
        status: 'unmapped',
      };
    });

    const seenSecKeys = new Map();
    const secInsertRows = secRows.map((s) => {
      const baseKey = `${account.fin_account_id}|${s.txn_date}|${s.kind}|${s.ticker ?? ''}`;
      const seq = seenSecKeys.get(baseKey) ?? 0;
      seenSecKeys.set(baseKey, seq + 1);
      const isTrade = s.kind === 'trade';
      return {
        fin_account_id: account.fin_account_id,
        import_batch_id: batch.import_batch_id,
        txn_date: s.txn_date,
        txn_type: isTrade ? s.side : 'dividend',
        ticker: s.ticker || null,
        name: s.name || null,
        currency: s.currency || 'USD',
        quantity: isTrade ? s.quantity : null,
        unit_price_usd: isTrade ? s.unit_price_usd : null,
        fee_usd: isTrade ? s.fee_usd : 0,
        gross_usd: isTrade ? null : s.gross_usd,
        tax_usd: isTrade ? 0 : s.tax_usd,
        dedup_key: securitiesDedupKey(account.fin_account_id, s, seq),
        status: 'unmapped',
      };
    });

    const { data: inserted, error: insErr } = rows.length
      ? await supabase.from('raw_transactions').upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true }).select()
      : { data: [], error: null };

    if (insErr) {
      errEl.textContent = '가져오기 실패: ' + insErr.message;
      btn.disabled = false;
      return;
    }

    const { data: secInserted, error: secInsErr } = secInsertRows.length
      ? await supabase.from('securities_transactions').upsert(secInsertRows, { onConflict: 'dedup_key', ignoreDuplicates: true }).select()
      : { data: [], error: null };

    if (secInsErr) {
      errEl.textContent = '가져오기 실패(증권거래): ' + secInsErr.message;
      btn.disabled = false;
      return;
    }

    const skipped = rows.length - (inserted?.length ?? 0);
    const secSkipped = secInsertRows.length - (secInserted?.length ?? 0);
    const parts = [];
    if (rows.length) parts.push(`현금 ${inserted?.length ?? 0}건${skipped ? ` (중복 ${skipped}건 건너뜀)` : ''}`);
    if (secInsertRows.length) parts.push(`증권거래/배당 ${secInserted?.length ?? 0}건${secSkipped ? ` (중복 ${secSkipped}건 건너뜀)` : ''}`);
    alert(`${parts.join(' · ')} 가져옴. [거래 검토·분개]/[증권 거래 분개] 화면에서 계속 진행하세요.`);
    parsed = null;
    document.getElementById('impFile').value = '';
    renderImportTransactions(container);
  };
}
