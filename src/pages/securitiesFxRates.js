import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { findFxRate } from '../lib/securitiesJournal.js';
import { esc, fmt, todayStr } from '../lib/util.js';

// 환율 — 조회 전용. 증권 매수·매도·배당(달러 거래)이 있었던 날짜별로 fx_rates에 어떤 환율이
// 적용됐는지(또는 안 됐는지) 보여준다. fx_rates 자체는 db/README_fx_rates.md 절차에 따라
// Claude가 SQL로 수동 시딩하는 테이블이라, 이 화면은 "그 시딩이 실제 거래일을 빠짐없이 커버하는지"
// 확인하는 대사 화면 역할도 겸한다(findFxRate와 같은 로직으로 근사/미확보를 판정).
let selectedYear = null;

export async function renderSecuritiesFxRates(container) {
  const years = await fetchFiscalYears();
  if (!selectedYear) selectedYear = years[years.length - 1] ?? Number(todayStr().slice(0, 4));

  const [{ data: finAccounts, error: finErr }, { data: fxRates, error: fxErr }] = await Promise.all([
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities').order('fin_account_id'),
    supabase.from('fx_rates').select('rate_date, currency, rate, source').eq('currency', 'USD').order('rate_date'),
  ]);
  if (finErr || fxErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc((finErr ?? fxErr).message)}</p></div>`;
    return;
  }

  const finAccountIds = finAccounts.map((a) => a.fin_account_id);
  const { data: txns, error: txnErr } = finAccountIds.length
    ? await supabase
        .from('securities_transactions')
        .select('txn_date, txn_type, currency')
        .in('fin_account_id', finAccountIds)
        .eq('currency', 'USD')
        .gte('txn_date', `${selectedYear}-01-01`)
        .lte('txn_date', `${selectedYear}-12-31`)
    : { data: [], error: null };
  if (txnErr) {
    container.innerHTML = `<div class="card"><p class="err">거래 조회 실패: ${esc(txnErr.message)}</p></div>`;
    return;
  }

  const typeLabel = { buy: '매수', sell: '매도', dividend: '배당' };
  const byDate = new Map();
  for (const t of txns ?? []) {
    const cur = byDate.get(t.txn_date) ?? new Set();
    cur.add(typeLabel[t.txn_type] ?? t.txn_type);
    byDate.set(t.txn_date, cur);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  const exactByDate = new Map((fxRates ?? []).map((r) => [r.rate_date, r]));
  let missingCount = 0;
  let approxCount = 0;

  const rows = dates
    .map((d) => {
      const exact = exactByDate.get(d);
      const kinds = [...byDate.get(d)].join('·');
      if (exact) {
        return `<tr>
          <td class="c">${esc(d)}</td>
          <td>${esc(kinds)}</td>
          <td class="num">${fmt(exact.rate)}</td>
          <td class="c"><span class="badge ok">정확</span></td>
          <td>${esc(exact.source ?? '')}</td>
        </tr>`;
      }
      const rate = findFxRate(fxRates ?? [], d);
      if (rate !== null) {
        approxCount++;
        const used = [...exactByDate.values()].find((r) => Number(r.rate) === rate);
        return `<tr>
          <td class="c">${esc(d)}</td>
          <td>${esc(kinds)}</td>
          <td class="num">${fmt(rate)}</td>
          <td class="c"><span class="badge draft">근사(${esc(used?.rate_date ?? '')})</span></td>
          <td>${esc(used?.source ?? '')}</td>
        </tr>`;
      }
      missingCount++;
      return `<tr>
        <td class="c">${esc(d)}</td>
        <td>${esc(kinds)}</td>
        <td class="num">-</td>
        <td class="c"><span class="badge bad">환율 미확보</span></td>
        <td></td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>환율(거래일 대사)</h2>
    <div class="toolbar">
      <label>연도: </label>
      <select id="fxRateYear">${years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}년</option>`).join('')}</select>
      <span class="note">${selectedYear}년 달러 거래일 <b>${dates.length}</b>건 중 정확 매치 <b>${dates.length - missingCount - approxCount}</b> · 근사 <b>${approxCount}</b> · 미확보 <b>${missingCount}</b></span>
    </div>
    <p class="note">증권 매수·매도·배당 등 달러 거래가 있었던 날짜에 fx_rates(db/README_fx_rates.md 절차로 수동 시딩)가 정확히 커버되는지 보여줍니다. "미확보"는 자동분개 시 해당 거래의 환율 산정이 막힌다는 뜻입니다.</p>
    <div style="overflow-x:auto"><table>
      <tr><th>일자</th><th>거래 종류</th><th>적용 환율</th><th>상태</th><th>출처</th></tr>
      ${rows || `<tr><td colspan="5" class="note">${selectedYear}년 달러 거래 내역이 없습니다.</td></tr>`}
    </table></div>
  </div>`;

  document.getElementById('fxRateYear').addEventListener('change', (ev) => {
    selectedYear = Number(ev.target.value);
    renderSecuritiesFxRates(container);
  });
}
