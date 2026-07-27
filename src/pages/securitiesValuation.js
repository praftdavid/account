import { supabase } from '../lib/supabaseClient.js';
import { fetchAccounts, fetchPeriodIdForDate } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';
import { computeRevaluation } from '../lib/securitiesJournal.js';

let asOfDate = todayStr();

// 증권 재평가 — 반기/연말 잔고증명서를 받으면 종목별 평가금액만 입력해 분개·세무조정·로트 갱신을
// 한 번에 처리한다(지금까지는 Claude가 수기 SQL로 해온 작업). 매도가능증권(11104)·매도가능증권평가익(33001)은
// 계좌 구분 없는 공유 계정이라, 계좌 선택 없이 전체 열린 로트를 한 번에 재평가한다(기존 반기 마감 관행과 동일).
export async function renderSecuritiesValuation(container) {
  const [{ data: lots, error: lotErr }, { data: finAccounts }, accounts] = await Promise.all([
    supabase.from('securities_lots').select('*').eq('status', 'open').order('ticker'),
    supabase.from('financial_accounts').select('*').eq('account_kind', 'securities'),
    fetchAccounts({ activeOnly: true }),
  ]);
  if (lotErr) {
    container.innerHTML = `<div class="card"><p class="err">조회 실패: ${esc(lotErr.message)}</p></div>`;
    return;
  }

  const acctName = (id) => finAccounts.find((a) => a.fin_account_id === id)?.institution_name ?? '-';
  const rows = (lots ?? [])
    .map(
      (l) => `<tr data-lot="${l.lot_id}" data-ticker="${esc(l.ticker)}">
        <td>${esc(acctName(l.fin_account_id))}</td>
        <td>${esc(l.name || l.ticker)}</td>
        <td class="num">${fmt(l.quantity)}</td>
        <td class="num">${fmt(l.cost_basis)}</td>
        <td class="num">${l.unrealized_oci ? fmt(l.unrealized_oci) : '–'}</td>
        <td><input type="number" class="valInput" placeholder="평가금액(원)" value="${l.fair_value ?? ''}" style="width:140px"></td>
        <td class="valDelta num"></td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>증권 재평가</h2>
    <p class="note">잔고증명서의 종목별 평가금액을 입력하면 재평가 분개(11104/33001)와 세무조정(종목별 유보)이 자동 생성되고,
      각 로트의 공정가치·평가차액이 갱신됩니다. 값을 안 채운 종목은 이번에 건너뜁니다.</p>
    <div class="toolbar">
      <label>기준일: </label>
      <input type="date" id="valDate" value="${asOfDate}">
      <button class="btn" id="valApply">재평가 반영</button>
      <span class="err" id="valErr"></span>
    </div>
    <div style="overflow-x:auto"><table id="valTable">
      <tr><th>계좌</th><th>종목명</th><th>수량</th><th>취득원가(원)</th><th>기존 평가차액</th><th>평가금액(원)</th><th>변동분</th></tr>
      ${rows || '<tr><td colspan="7" class="note">보유 중인 종목이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('valDate').addEventListener('change', (ev) => {
    asOfDate = ev.target.value;
  });

  const recompute = (tr) => {
    const lot = lots.find((l) => l.lot_id === Number(tr.dataset.lot));
    const input = tr.querySelector('.valInput');
    const deltaCell = tr.querySelector('.valDelta');
    const raw = input.value;
    if (raw === '') { deltaCell.textContent = ''; return; }
    const { delta } = computeRevaluation(lot, Number(raw));
    deltaCell.textContent = fmt(delta);
    deltaCell.style.color = delta > 0 ? '#b3261e' : delta < 0 ? '#1f4fd8' : 'inherit';
  };
  container.querySelectorAll('.valInput').forEach((input) => {
    input.addEventListener('input', () => recompute(input.closest('tr')));
    recompute(input.closest('tr'));
  });

  document.getElementById('valApply').onclick = async () => {
    const btn = document.getElementById('valApply');
    const errEl = document.getElementById('valErr');
    btn.disabled = true;
    errEl.textContent = '';

    const { data: acc } = await supabase.from('accounts').select('account_id, account_code').in('account_code', ['11104', '33001']);
    const securitiesAccountId = acc.find((a) => a.account_code === '11104')?.account_id;
    const ociAccountId = acc.find((a) => a.account_code === '33001')?.account_id;
    if (!securitiesAccountId || !ociAccountId) {
      errEl.textContent = '계정과목(11104/33001)을 찾을 수 없습니다';
      btn.disabled = false;
      return;
    }

    let periodId;
    try {
      periodId = await fetchPeriodIdForDate(asOfDate);
    } catch {
      periodId = null;
    }
    if (!periodId) {
      errEl.textContent = '해당 기준일의 회계기간을 찾을 수 없습니다';
      btn.disabled = false;
      return;
    }

    const changes = [];
    for (const tr of container.querySelectorAll('tr[data-lot]')) {
      const raw = tr.querySelector('.valInput').value;
      if (raw === '') continue;
      const lot = lots.find((l) => l.lot_id === Number(tr.dataset.lot));
      const fairValue = Number(raw);
      const { newOci, delta } = computeRevaluation(lot, fairValue);
      if (delta !== 0) changes.push({ lot, fairValue, newOci, delta });
    }

    if (!changes.length) {
      errEl.textContent = '변동된 종목이 없습니다(값을 입력했는지, 기존 평가금액과 같지 않은지 확인).';
      btn.disabled = false;
      return;
    }

    const netDelta = changes.reduce((s, c) => s + c.delta, 0);

    // 1) 재평가 분개(1건) — netDelta>0: 차)11104 / 대)33001, netDelta<0이면 반대
    if (netDelta !== 0) {
      const amt = Math.abs(netDelta);
      const { data: entry, error: e1 } = await supabase
        .from('journal_entries')
        .insert({ entry_date: asOfDate, period_id: periodId, description: `[증권 재평가] ${asOfDate} 기준`, source_type: 'auto', status: 'draft' })
        .select()
        .single();
      if (e1) {
        errEl.textContent = '분개 생성 실패: ' + e1.message;
        btn.disabled = false;
        return;
      }
      const lines = netDelta > 0
        ? [
            { entry_id: entry.entry_id, account_id: securitiesAccountId, debit_amount: amt, credit_amount: 0, segment: 'invest' },
            { entry_id: entry.entry_id, account_id: ociAccountId, debit_amount: 0, credit_amount: amt, segment: 'invest' },
          ]
        : [
            { entry_id: entry.entry_id, account_id: ociAccountId, debit_amount: amt, credit_amount: 0, segment: 'invest' },
            { entry_id: entry.entry_id, account_id: securitiesAccountId, debit_amount: 0, credit_amount: amt, segment: 'invest' },
          ];
      const { error: e2 } = await supabase.from('journal_lines').insert(lines);
      if (e2) {
        await supabase.from('journal_entries').delete().eq('entry_id', entry.entry_id);
        errEl.textContent = '분개 라인 생성 실패: ' + e2.message;
        btn.disabled = false;
        return;
      }
    }

    // 2) 종목별 세무조정 페어 + 로트/스냅샷 갱신
    const fiscalYear = Number(asOfDate.slice(0, 4));
    for (const { lot, fairValue, newOci, delta } of changes) {
      const gain = delta > 0;
      await supabase.from('tax_adjustments').insert([
        {
          fiscal_year: fiscalYear,
          item_name: `매도가능증권평가익(${lot.ticker})`,
          adjust_type: gain ? '손금산입' : '익금산입',
          amount: Math.abs(delta),
          disposal: '△유보',
          memo: `${asOfDate} 재평가 — 평가차액 ${fmt(newOci)}(변동 ${fmt(delta)})`,
        },
        {
          fiscal_year: fiscalYear,
          item_name: `매도가능증권(${lot.ticker})`,
          adjust_type: gain ? '익금산입' : '손금산입',
          amount: Math.abs(delta),
          disposal: '기타',
          memo: `위 손금산입/익금산입의 상대 조정`,
        },
      ]);

      await supabase.from('securities_lots').update({ fair_value: fairValue, unrealized_oci: newOci }).eq('lot_id', lot.lot_id);

      await supabase.from('securities_valuations').upsert(
        {
          fin_account_id: lot.fin_account_id,
          as_of_date: asOfDate,
          ticker: lot.ticker,
          name: lot.name,
          quantity: lot.quantity,
          unit_price: Number(lot.quantity) > 0 ? fairValue / Number(lot.quantity) : fairValue,
          fair_value: fairValue,
          cost_basis: lot.cost_basis,
          source: '사용자 입력',
        },
        { onConflict: 'fin_account_id,as_of_date,ticker' }
      );
    }

    btn.disabled = false;
    alert(`재평가 반영 완료: ${changes.length}개 종목, 순변동 ${fmt(netDelta)}원. [분개장]에서 확인 후 전기하세요.`);
    renderSecuritiesValuation(container);
  };
}
