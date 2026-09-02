import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchPeriodIdForDate, fetchMaxEntryNo, formatEntryNo } from '../lib/data.js';
import { esc, fmt } from '../lib/util.js';
import { findFxRate, computeBuy, computeSell, computeDividend, computeOciReversal, buildBuyLines, buildSellLines, buildOciReversalLines, buildDividendLines } from '../lib/securitiesJournal.js';

let selectedFinAccountId = null;

// 매도가능증권 자산이 아닌 부수계정(선납세금·금융영업수익·금융영업비용)은 계좌관리 화면 밖의
// 고정 계정이라 종목/계좌에 상관없이 계정코드로 직접 찾는다(§7 부문표의 'invest' 세그먼트 사용).
function findAcct(accounts, code) {
  const a = accounts.find((x) => x.account_code === code);
  if (!a) throw new Error(`계정과목(${code})을 찾을 수 없습니다`);
  return a.account_id;
}

export async function renderSecuritiesReview(container) {
  const [{ data: finAccounts, error: finErr }, accounts, { data: fxRates, error: fxErr }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('is_active', true).eq('account_kind', 'securities').order('fin_account_id'),
    fetchAccounts({ activeOnly: true }),
    supabase.from('fx_rates').select('rate_date, rate').eq('currency', 'USD').order('rate_date'),
  ]);
  if (finErr || fxErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc((finErr ?? fxErr).message)}</p></div>`;
    return;
  }

  if (!selectedFinAccountId && finAccounts.length) selectedFinAccountId = finAccounts[0].fin_account_id;
  const account = finAccounts.find((a) => a.fin_account_id === selectedFinAccountId);

  const acctOptions = finAccounts
    .map((a) => `<option value="${a.fin_account_id}" ${a.fin_account_id === selectedFinAccountId ? 'selected' : ''}>${esc(a.institution_name)}${a.account_no_masked ? ` (${esc(a.account_no_masked)})` : ''}</option>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>증권 거래 분개</h2>
    <div class="toolbar">
      <label>계좌: </label>
      <select id="secAcct">${acctOptions || '<option>등록된 증권 계좌 없음</option>'}</select>
    </div>
    <div id="secBody"><p class="note">불러오는 중…</p></div>
  </div>`;

  document.getElementById('secAcct').addEventListener('change', (ev) => {
    selectedFinAccountId = Number(ev.target.value);
    renderSecuritiesReview(container);
  });

  if (!account) return;
  const body = document.getElementById('secBody');

  const [{ data: pending, error: txnErr }, { data: lots, error: lotErr }] = await Promise.all([
    supabase
      .from('securities_transactions')
      .select('*')
      .eq('fin_account_id', account.fin_account_id)
      .eq('status', 'unmapped')
      .order('txn_date'),
    supabase.from('securities_lots').select('*').eq('fin_account_id', account.fin_account_id).eq('status', 'open'),
  ]);
  if (txnErr || lotErr) {
    body.innerHTML = `<p class="err">거래 조회 실패: ${esc((txnErr ?? lotErr).message)}</p>`;
    return;
  }

  if (!pending.length) {
    body.innerHTML = '<p class="note">분개할 증권 거래가 없습니다. [거래 업로드] 화면에서 먼저 파일을 올려주세요.</p>';
    return;
  }

  // 미리보기: 이동평균은 종목별로 순차 진행되어야 정확하므로, txn_date 오름차순으로 이미
  // 종목별 lot 상태를 시뮬레이션하며 계산한다(실제 분개 생성 시에도 동일 순서로 처리).
  const lotByTicker = new Map(lots.map((l) => [l.ticker, { ...l }]));
  const rows = pending.map((t) => {
    const isKrw = t.currency === 'KRW';
    const fxRate = isKrw ? 1 : findFxRate(fxRates, t.txn_date);
    const hasRate = fxRate !== null && fxRate !== undefined;
    let preview = '';
    let computed = null;

    if (t.txn_type === 'buy' || t.txn_type === 'sell') {
      const lot = lotByTicker.get(t.ticker) ?? null;
      if (hasRate) {
        if (t.txn_type === 'buy') {
          computed = computeBuy(lot, t, fxRate);
          lotByTicker.set(t.ticker, { ticker: t.ticker, quantity: computed.newQty, unit_cost: computed.newUnitCost, cost_basis: computed.newCostBasis, unrealized_oci: lot?.unrealized_oci ?? 0 });
          preview = `취득원가 ${fmt(computed.costKrw)} · 평균단가 ${fmt(Math.round(computed.newUnitCost))}`;
        } else {
          computed = computeSell(lot, t, fxRate);
          const ociReversal = computeOciReversal(lot, t.quantity);
          const newUnitCost = lot ? Number(lot.unit_cost) : 0;
          lotByTicker.set(t.ticker, { ticker: t.ticker, quantity: computed.newQty, unit_cost: newUnitCost, cost_basis: computed.newCostBasis, unrealized_oci: ociReversal.remainingOci });
          const glLabel = computed.gainLoss >= 0 ? '이익' : '손실';
          preview = `순매도대금 ${fmt(computed.proceedsKrw)} · 원가 ${fmt(computed.costRemoved)} · ${glLabel} ${fmt(Math.abs(computed.gainLoss))}`;
          if (ociReversal.reversedOci) preview += ` · 유보추인 ${fmt(ociReversal.reversedOci)}`;
          if (!lot || Number(lot.quantity) < Number(t.quantity)) preview = `<span class="err">보유수량 부족(보유 ${lot ? fmt(lot.quantity) : 0}) — 매수 거래를 먼저 분개하세요</span>`;
        }
      }
    } else {
      computed = hasRate ? computeDividend(t, fxRate) : null;
      if (computed) preview = `실수령 ${fmt(computed.netKrw)} · 원천세 ${fmt(computed.taxKrw)}`;
    }

    const canProcess = hasRate && computed && !(t.txn_type === 'sell' && String(preview).includes('부족'));
    const typeLabel = t.txn_type === 'buy' ? '매수' : t.txn_type === 'sell' ? '매도' : '배당';
    return `<tr data-txn="${t.sec_txn_id}" data-type="${t.txn_type}">
      <td><input type="checkbox" class="rowChk" ${canProcess ? 'checked' : 'disabled'}></td>
      <td class="c">${esc(t.txn_date)}</td>
      <td>${typeLabel}</td>
      <td>${esc(t.name || t.ticker || '')}</td>
      <td class="num">${t.quantity ? fmt(t.quantity) : ''}</td>
      <td class="num">${t.unit_price_usd ? fmt(t.unit_price_usd) : ''}</td>
      <td class="c">${hasRate ? fmt(fxRate) : '<span class="err">환율 미확보</span>'}</td>
      <td>${preview}</td>
    </tr>`;
  });

  body.innerHTML = `
    <div class="toolbar">
      <span class="note">${pending.length}건 대기 (반드시 날짜순으로 처리 — 이동평균 정확성을 위해 매도가 매수보다 먼저 처리되지 않도록 순서가 고정됩니다)</span>
      <button class="btn" id="secGenerate">선택 건 분개 생성</button>
      <span class="err" id="secErr"></span>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th></th><th>일자</th><th>구분</th><th>종목</th><th>수량</th><th>단가</th><th>환율</th><th>미리보기</th></tr>
      ${rows.join('')}
    </table></div>`;

  document.getElementById('secGenerate').onclick = async () => {
    const btn = document.getElementById('secGenerate');
    const errEl = document.getElementById('secErr');
    btn.disabled = true;
    errEl.textContent = '';

    let securitiesAccountId, taxAccountId, incomeAccountId, expenseAccountId, ociAccountId, dividendAccountId;
    try {
      securitiesAccountId = findAcct(accounts, '11104');
      taxAccountId = findAcct(accounts, '11106');
      incomeAccountId = findAcct(accounts, '41002'); // 증권매매수익 — 실현매매차익 전용
      expenseAccountId = findAcct(accounts, '51002'); // 증권매매손실
      dividendAccountId = findAcct(accounts, '41003'); // 배당금수익 — 매매차익과 분리 관리
      ociAccountId = findAcct(accounts, '33001');
    } catch (err) {
      errEl.textContent = err.message;
      btn.disabled = false;
      return;
    }

    // 선택된 행을 txn_date 오름차순(이미 테이블 자체가 그 순서)으로 처리. lot은 DB에서
    // 다시 읽지 않고 처리하며 갱신한 값을 메모리에서 그대로 이어 쓴다(같은 종목 여러 건 연속 처리 시
    // 매번 재조회하면 방금 만든 변경이 반영 안 될 수 있어서).
    const lotState = new Map(lots.map((l) => [l.ticker, { ...l }]));
    const selectedTrs = [...body.querySelectorAll('tr[data-txn]')].filter((tr) => tr.querySelector('.rowChk').checked && !tr.querySelector('.rowChk').disabled);

    let created = 0;
    let skipped = 0;
    const entryNoCache = {}; // fiscalYear -> 다음에 쓸 전표번호(정수). 배치 안에서 매번 다시 조회하지 않게 캐시.

    for (const tr of selectedTrs) {
      const secTxnId = Number(tr.dataset.txn);
      const t = pending.find((p) => p.sec_txn_id === secTxnId);
      if (!t) { skipped++; continue; }

      const isKrw = t.currency === 'KRW';
      const fxRate = isKrw ? 1 : findFxRate(fxRates, t.txn_date);
      if (fxRate === null || fxRate === undefined) { skipped++; continue; }

      let periodId;
      try {
        periodId = await fetchPeriodIdForDate(t.txn_date);
      } catch {
        periodId = null;
      }
      if (!periodId) { skipped++; continue; }

      let lines;
      let lotUpdate;
      let description;
      let ociReversal = null;

      if (t.txn_type === 'buy') {
        const lot = lotState.get(t.ticker) ?? null;
        const computed = computeBuy(lot, t, fxRate);
        lines = buildBuyLines(computed.costKrw, securitiesAccountId, account.linked_gl_account_id);
        lotUpdate = { ticker: t.ticker, name: t.name, quantity: computed.newQty, unit_cost: computed.newUnitCost, cost_basis: computed.newCostBasis, acquire_date: lot?.acquire_date ?? t.txn_date, status: 'open' };
        description = `[증권매수] ${t.name || t.ticker} ${fmt(t.quantity)}주 @${fmt(t.unit_price_usd)}${isKrw ? '' : 'USD'}`;
      } else if (t.txn_type === 'sell') {
        const lot = lotState.get(t.ticker) ?? null;
        if (!lot || Number(lot.quantity) < Number(t.quantity)) { skipped++; continue; }
        const computed = computeSell(lot, t, fxRate);
        ociReversal = computeOciReversal(lot, t.quantity);
        lines = [
          ...buildSellLines(computed, securitiesAccountId, account.linked_gl_account_id, incomeAccountId, expenseAccountId),
          ...buildOciReversalLines(ociReversal.reversedOci, securitiesAccountId, ociAccountId),
        ];
        lotUpdate = { ticker: t.ticker, name: lot.name, quantity: computed.newQty, unit_cost: Number(lot.unit_cost), cost_basis: computed.newCostBasis, unrealized_oci: ociReversal.remainingOci, acquire_date: lot.acquire_date, status: computed.newQty > 0 ? 'open' : 'closed', close_date: computed.newQty > 0 ? null : t.txn_date };
        description = `[증권매도] ${t.name || t.ticker} ${fmt(t.quantity)}주 @${fmt(t.unit_price_usd)}${isKrw ? '' : 'USD'} 실현손익 ${fmt(computed.gainLoss)}${ociReversal.reversedOci ? ` · 유보추인 ${fmt(ociReversal.reversedOci)}` : ''}`;
      } else {
        const computed = computeDividend(t, fxRate);
        lines = buildDividendLines(computed, account.linked_gl_account_id, taxAccountId, dividendAccountId);
        description = `[배당금] ${t.name || t.ticker}`;
      }

      const fiscalYear = Number(t.txn_date.slice(0, 4));
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
        .insert({ entry_no: entryNo, entry_date: t.txn_date, period_id: periodId, description, source_type: 'auto', status: 'draft' })
        .select()
        .single();
      if (e1) { skipped++; continue; }

      const { error: e2 } = await supabase.from('journal_lines').insert(lines.map((l) => ({ ...l, entry_id: entry.entry_id })));
      if (e2) {
        await supabase.from('journal_entries').delete().eq('entry_id', entry.entry_id);
        skipped++;
        continue;
      }

      if (ociReversal?.reversedOci) {
        // 그 종목 몫 유보를 추인 — 전기 평가익 환입과 동일한 쌍(익금산입 유보 + 손금산입 기타)의
        // 부호를 반대로 하면 되므로 같은 패턴을 재사용한다. 종목명을 항목명에 붙여 기존 반기 집계
        // 유보(항목명에 종목명 없음)와 구분되게 별도 줄로 쌓는다 — 합계는 그대로 정확히 줄어든다.
        const fiscalYear = Number(t.txn_date.slice(0, 4));
        const amt = Math.abs(ociReversal.reversedOci);
        const gain = ociReversal.reversedOci > 0; // 평가이익 추인이면 익금산입 유보, 평가손실 추인이면 반대
        await supabase.from('tax_adjustments').insert([
          {
            fiscal_year: fiscalYear,
            item_name: `매도가능증권평가익(${t.ticker})`,
            adjust_type: gain ? '익금산입' : '손금산입',
            amount: amt,
            disposal: '유보',
            memo: `${t.txn_date} ${t.name || t.ticker} ${fmt(t.quantity)}주 매도에 따른 유보 추인`,
          },
          {
            fiscal_year: fiscalYear,
            item_name: `매도가능증권(${t.ticker})`,
            adjust_type: gain ? '손금산입' : '익금산입',
            amount: amt,
            disposal: '기타',
            memo: `위 유보 추인의 상대 조정`,
          },
        ]);
      }

      if (lotUpdate) {
        // securities_lots는 (fin_account_id, ticker) WHERE status='open' 부분 유니크 인덱스라
        // supabase-js의 upsert(onConflict)가 partial index를 못 잡는다 — lot_id로 직접 분기.
        const existingLotId = lotState.get(t.ticker)?.lot_id;
        const { error: lotErr2, data: lotRow } = existingLotId
          ? await supabase.from('securities_lots').update(lotUpdate).eq('lot_id', existingLotId).select().single()
          : await supabase.from('securities_lots').insert({ fin_account_id: account.fin_account_id, ...lotUpdate }).select().single();
        if (lotErr2) {
          // lot 갱신 실패해도 분개 자체는 이미 생성됨 — 사용자가 잔고 대사 화면에서 발견 가능하도록 로그만 남김.
          console.error('lot upsert failed', lotErr2);
        } else {
          lotState.set(t.ticker, lotRow);
        }
      }

      await supabase.from('securities_transactions').update({ status: 'journalized', generated_entry_id: entry.entry_id }).eq('sec_txn_id', secTxnId);
      created++;
    }

    btn.disabled = false;
    alert(`분개 ${created}건 생성됨(draft)${skipped ? `, ${skipped}건 건너뜀(환율 미확보/보유수량 부족 등)` : ''}. [분개장]에서 확인 후 전기(승인)하세요.`);
    renderSecuritiesReview(container);
  };
}
