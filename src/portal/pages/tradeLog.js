import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr, fmt, wireThousandsInput, parseThousands } from '../../lib/util.js';
import { renderAttachmentsWidget, uploadAttachment, listAttachments, deleteAttachment } from '../../lib/attachments.js';
import { TRADE_REASON_CATEGORIES } from '../lib/tradeReasons.js';

const SIDE_LABEL = { buy: '매수', sell: '매도' };
const SIDE_BADGE = { buy: 'ok', sell: 'bad' };
const TEXTAREA_STYLE = 'width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical;line-height:1.6';

// 우리 사업의 핵심이 주식매매라, 어떤 종목을 왜 매수·매도했는지 근거를 남기고 나중에 시간
// 흐름대로 되짚어볼 수 있어야 한다는 요청으로 만든 독립 메뉴. 전자결재처럼 결재선을 타는
// 공식 문서가 아니라 개인/팀의 판단 기록이라, 승인 절차 없이 바로 등록·수정·삭제한다.
let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentTradeId = null;
let sideFilter = 'all';
let stockFilter = 'all';
let strategyFilter = 'all';
let reasonFilter = 'all';
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentTradeId = null;
}

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

export async function renderTradeLog(container) {
  if (mode === 'list') return renderList(container);
  if (mode === 'new' || mode === 'edit') return renderForm(container);
  return renderDetail(container);
}

async function renderList(container) {
  const { data: allTrades, error } = await supabase.from('trade_logs').select('*').order('trade_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">매매일지 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allTrades.map((t) => yearOf(t.trade_date)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());
  const stocks = [...new Set(allTrades.map((t) => t.stock_name))].sort();
  const strategies = [...new Set(allTrades.map((t) => t.strategy).filter(Boolean))].sort();

  const trades = allTrades.filter(
    (t) =>
      (sideFilter === 'all' || t.side === sideFilter) &&
      (stockFilter === 'all' || t.stock_name === stockFilter) &&
      (strategyFilter === 'all' || t.strategy === strategyFilter) &&
      (reasonFilter === 'all' || (t.reasons ?? []).some((r) => r.category === reasonFilter)) &&
      (yearFilter === 'all' || yearOf(t.trade_date) === Number(yearFilter))
  );

  const tabs = [['all', '전체'], ['buy', '매수'], ['sell', '매도']]
    .map(([k, label]) => `<button class="btn sm ${k === sideFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');
  const stockOptions = ['<option value="all">전체 종목</option>', ...stocks.map((s) => `<option value="${esc(s)}" ${s === stockFilter ? 'selected' : ''}>${esc(s)}</option>`)].join('');
  const strategyOptions = ['<option value="all">전체 전략</option>', ...strategies.map((s) => `<option value="${esc(s)}" ${s === strategyFilter ? 'selected' : ''}>${esc(s)}</option>`)].join('');
  const reasonOptions = ['<option value="all">전체 근거</option>', ...TRADE_REASON_CATEGORIES.map((c) => `<option value="${c.key}" ${c.key === reasonFilter ? 'selected' : ''}>${c.key}</option>`)].join('');
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = trades
    .map(
      (t) => `<tr>
        <td class="c">${t.trade_date}</td>
        <td><a href="#" data-open="${t.trade_id}">${esc(t.stock_name)}</a>${t.ticker ? ` <span class="note">(${esc(t.ticker)})</span>` : ''}</td>
        <td class="c"><span class="badge ${SIDE_BADGE[t.side]}">${SIDE_LABEL[t.side]}</span></td>
        <td>${(t.reasons ?? []).map((r) => `<span class="badge draft" style="margin-right:4px">${esc(r.category)}</span>`).join('')}</td>
        <td class="c">${esc(t.strategy ?? '')}</td>
        <td class="num">${fmt(t.quantity)}</td>
        <td class="num">${fmt(t.price)}</td>
        <td class="num">${fmt(t.quantity * t.price)}</td>
        <td class="c">${esc(t.created_by ?? '')}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${tabs}
      <select id="stockSel" style="margin-left:8px">${stockOptions}</select>
      <select id="reasonSel" style="margin-left:8px">${reasonOptions}</select>
      <select id="strategySel" style="margin-left:8px">${strategyOptions}</select>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn" id="newTradeBtn" style="margin-left:auto">매매 기록</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>거래일</th><th>종목</th><th>구분</th><th>근거</th><th>전략</th><th>수량</th><th>단가</th><th>총액</th><th>작성자</th></tr>
      ${rows || '<tr><td colspan="9" class="note" style="text-align:center">등록된 매매일지가 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { sideFilter = b.dataset.filter; renderTradeLog(container); };
  });
  document.getElementById('stockSel').onchange = (ev) => { stockFilter = ev.target.value; renderTradeLog(container); };
  document.getElementById('reasonSel').onchange = (ev) => { reasonFilter = ev.target.value; renderTradeLog(container); };
  document.getElementById('strategySel').onchange =(ev) => { strategyFilter = ev.target.value; renderTradeLog(container); };
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderTradeLog(container); };
  document.getElementById('newTradeBtn').onclick = () => { currentTradeId = null; mode = 'new'; renderTradeLog(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentTradeId = Number(a.dataset.open); mode = 'view'; renderTradeLog(container); };
  });
}

async function renderForm(container) {
  let trade = null;
  if (mode === 'edit' && currentTradeId) {
    const { data, error } = await supabase.from('trade_logs').select('*').eq('trade_id', currentTradeId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">매매일지 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    trade = data;
  }

  container.innerHTML = `
  <div class="card">
    <h2>${trade ? '매매일지 수정' : '매매 기록'}</h2>
    <form class="entry" id="tradeForm">
      <div style="grid-column:span 3"><label>거래일 *</label><input id="f_date" type="date" required value="${trade?.trade_date ?? todayStr()}"></div>
      <div style="grid-column:span 4"><label>종목명 *</label><input id="f_stock" type="text" required value="${esc(trade?.stock_name ?? '')}"></div>
      <div style="grid-column:span 2"><label>티커</label><input id="f_ticker" type="text" value="${esc(trade?.ticker ?? '')}"></div>
      <div style="grid-column:span 3"><label>구분 *</label><select id="f_side"><option value="buy" ${(trade?.side ?? 'buy') === 'buy' ? 'selected' : ''}>매수</option><option value="sell" ${trade?.side === 'sell' ? 'selected' : ''}>매도</option></select></div>
      <div style="grid-column:span 3"><label>수량 *</label><input id="f_qty" type="text" required inputmode="numeric" value="${trade?.quantity != null ? Number(trade.quantity).toLocaleString() : ''}"></div>
      <div style="grid-column:span 3"><label>단가 *</label><input id="f_price" type="text" required inputmode="numeric" value="${trade?.price != null ? Number(trade.price).toLocaleString() : ''}"></div>
      <div style="grid-column:span 6"><label>전략/셋업</label><input id="f_strategy" type="text" placeholder="예: 브레이크아웃, 저가매수, 실적서프라이즈" value="${esc(trade?.strategy ?? '')}"></div>
      <div style="grid-column:span 12">
        <label>매매 이유 분류 * <span class="note">(해당하는 분류를 모두 선택하고, 분류별로 세부 사유를 적어주세요)</span></label>
        <div id="reasonChips" class="toolbar" style="margin:6px 0 0"></div>
        <div id="reasonBlocks"></div>
      </div>
      <div style="grid-column:span 12">
        <label>추가 메모</label>
        <textarea id="f_rationale" rows="4" placeholder="분류에 담기지 않는 생각, 종합 의견, 시나리오 등을 자유롭게 적어주세요. (선택)" style="${TEXTAREA_STYLE}">${esc(trade?.rationale ?? '')}</textarea>
      </div>
      <div style="grid-column:span 12">
        ${trade ? '<div id="existingAttWrap"></div>' : ''}
        <label>첨부파일 ${trade ? '추가' : ''}</label><input type="file" id="f_attachments" multiple>
        <p class="note">차트 스크린샷, 리서치 자료, 매매 체결 내역 등을 첨부하세요.</p>
      </div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="tradeErr"></span>
      </div>
    </form>
  </div>`;

  wireThousandsInput(document.getElementById('f_qty'));
  wireThousandsInput(document.getElementById('f_price'));

  // 분류를 고르면 그 분류의 가이드와 입력칸이 나타난다. 칩을 토글해 다시 그리기 전에 이미
  // 써둔 내용을 selected에 옮겨 담아야 다른 분류를 추가/해제해도 작성 중인 글이 사라지지 않는다.
  const selected = new Map((trade?.reasons ?? []).map((r) => [r.category, r.detail ?? '']));
  const syncFromDom = () => container.querySelectorAll('[data-reason-text]').forEach((ta) => selected.set(ta.dataset.reasonText, ta.value));
  const renderReasons = () => {
    document.getElementById('reasonChips').innerHTML = TRADE_REASON_CATEGORIES.map(
      (c) => `<button type="button" class="btn sm ${selected.has(c.key) ? '' : 'ghost'}" data-chip="${c.key}">${c.key}</button>`
    ).join('');
    document.getElementById('reasonBlocks').innerHTML = TRADE_REASON_CATEGORIES.filter((c) => selected.has(c.key))
      .map(
        (c) => `<div style="margin-top:14px">
          <label>${c.key} — 세부 사유 *</label>
          <p class="note" style="white-space:pre-line;margin:2px 0 6px">${esc(c.guide)}</p>
          <textarea data-reason-text="${c.key}" rows="5" placeholder="구체적으로 적을수록 나중에 복기하기 좋습니다." style="${TEXTAREA_STYLE}">${esc(selected.get(c.key))}</textarea>
        </div>`
      )
      .join('');
    container.querySelectorAll('[data-chip]').forEach((b) => {
      b.onclick = () => {
        syncFromDom();
        const key = b.dataset.chip;
        if (selected.has(key)) selected.delete(key);
        else selected.set(key, '');
        renderReasons();
      };
    });
  };
  renderReasons();

  if (trade) {
    const email = await currentUserEmail();
    renderAttachmentsWidget(document.getElementById('existingAttWrap'), 'trade', trade.trade_id, email, { allowUpload: false, allowDelete: true });
  }

  document.getElementById('cancelBtn').onclick = () => {
    mode = trade ? 'view' : 'list';
    if (!trade) currentTradeId = null;
    renderTradeLog(container);
  };

  document.getElementById('tradeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('tradeErr');
    errEl.textContent = '';

    syncFromDom();
    const reasons = [...selected].map(([category, detail]) => ({ category, detail: detail.trim() }));
    if (reasons.length === 0) { errEl.textContent = '매매 이유 분류를 하나 이상 선택해 주세요.'; return; }
    const empty = reasons.find((r) => !r.detail);
    if (empty) { errEl.textContent = `"${empty.category}"의 세부 사유를 적어주세요.`; return; }

    const payload = {
      trade_date: document.getElementById('f_date').value,
      stock_name: document.getElementById('f_stock').value.trim(),
      ticker: document.getElementById('f_ticker').value.trim() || null,
      side: document.getElementById('f_side').value,
      quantity: parseThousands(document.getElementById('f_qty').value),
      price: parseThousands(document.getElementById('f_price').value),
      strategy: document.getElementById('f_strategy').value.trim() || null,
      reasons,
      rationale: document.getElementById('f_rationale').value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (trade) {
      const { error } = await supabase.from('trade_logs').update(payload).eq('trade_id', trade.trade_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentTradeId = trade.trade_id;
    } else {
      const email = await currentUserEmail();
      const { data, error } = await supabase.from('trade_logs').insert({ ...payload, created_by: email }).select().single();
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentTradeId = data.trade_id;
      trade = data; // 첨부파일 업로드 실패로 폼에 머무른 채 재제출해도 중복 생성되지 않도록 갱신
    }

    const files = [...document.getElementById('f_attachments').files];
    if (files.length > 0) {
      const email = await currentUserEmail();
      errEl.textContent = `첨부파일 업로드 중… (0/${files.length})`;
      for (const [i, file] of files.entries()) {
        try {
          await uploadAttachment('trade', currentTradeId, file, email);
          errEl.textContent = `첨부파일 업로드 중… (${i + 1}/${files.length})`;
        } catch (err) {
          errEl.textContent = `"${file.name}" 첨부 실패: ${err.message} (매매일지는 저장되었습니다)`;
          return;
        }
      }
    }

    mode = 'view';
    renderTradeLog(container);
  });
}

async function renderDetail(container) {
  const { data: trade, error } = await supabase.from('trade_logs').select('*').eq('trade_id', currentTradeId).single();
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">매매일지 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">${esc(trade.stock_name)}</h2>
      ${trade.ticker ? `<span class="note">(${esc(trade.ticker)})</span>` : ''}
      <span class="badge ${SIDE_BADGE[trade.side]}" style="margin-left:10px">${SIDE_LABEL[trade.side]}</span>
      <span style="margin-left:auto">
        <button class="btn ghost" id="editBtn">수정</button>
        <button class="btn danger" id="deleteBtn">삭제</button>
        <button class="btn ghost" id="backBtn">목록</button>
      </span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px">
      <tr><td style="width:25%;padding:4px 0">거래일 : ${trade.trade_date}</td><td style="padding:4px 0">작성자 : ${esc(trade.created_by ?? '')}</td></tr>
      <tr><td style="padding:4px 0">수량 : ${fmt(trade.quantity)}</td><td style="padding:4px 0">단가 : ${fmt(trade.price)}</td></tr>
      <tr><td style="padding:4px 0">총액 : ${fmt(trade.quantity * trade.price)}</td><td style="padding:4px 0">전략/셋업 : ${esc(trade.strategy ?? '')}</td></tr>
    </table>
  </div>
  <div class="card">
    <h2>매매 이유</h2>
    ${(trade.reasons ?? [])
      .map(
        (r) => `<div style="margin-bottom:14px">
          <span class="badge draft">${esc(r.category)}</span>
          <p style="white-space:pre-wrap;font-size:14px;line-height:1.7;margin-top:6px">${esc(r.detail)}</p>
        </div>`
      )
      .join('')}
    ${trade.rationale ? `<h3 style="margin-top:6px">추가 메모</h3><p style="white-space:pre-wrap;font-size:14px;line-height:1.7">${esc(trade.rationale)}</p>` : ''}
    ${(trade.reasons ?? []).length === 0 && !trade.rationale ? '<p class="note">기록된 이유가 없습니다.</p>' : ''}
  </div>
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">결과/복기</h2>
      <button class="btn ghost sm" id="editReviewBtn" style="margin-left:auto">${trade.review ? '수정' : '작성'}</button>
    </div>
    <div id="reviewView">${
      trade.review
        ? `<p style="white-space:pre-wrap;font-size:14px;line-height:1.7">${esc(trade.review)}</p>`
        : '<p class="note">시간이 지난 뒤, 이 판단이 맞았는지 되짚어 적어보세요.</p>'
    }</div>
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderTradeLog(container); };
  document.getElementById('editBtn').onclick = () => { mode = 'edit'; renderTradeLog(container); };

  document.getElementById('editReviewBtn').onclick = () => {
    const reviewView = document.getElementById('reviewView');
    reviewView.innerHTML = `
      <textarea id="f_reviewEdit" rows="8" placeholder="지금 시점에서 돌아봤을 때, 당시 판단이 맞았는지·무엇을 배웠는지 적어주세요." style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical;line-height:1.6">${esc(trade.review ?? '')}</textarea>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn sm" id="saveReviewBtn">저장</button>
        <button class="btn ghost sm" id="cancelReviewBtn">취소</button>
        <span class="err" id="reviewErr"></span>
      </div>`;
    document.getElementById('cancelReviewBtn').onclick = () => renderTradeLog(container);
    document.getElementById('saveReviewBtn').onclick = async () => {
      const value = document.getElementById('f_reviewEdit').value.trim() || null;
      const { error: reviewErr } = await supabase.from('trade_logs').update({ review: value }).eq('trade_id', trade.trade_id);
      if (reviewErr) { document.getElementById('reviewErr').textContent = '저장 실패: ' + reviewErr.message; return; }
      renderTradeLog(container);
    };
  };
  document.getElementById('deleteBtn').onclick = async () => {
    if (!confirm('이 매매일지를 삭제할까요? 첨부파일도 함께 삭제되며 되돌릴 수 없습니다.')) return;
    try {
      const atts = await listAttachments('trade', trade.trade_id);
      for (const a of atts) await deleteAttachment(a);
      const { error: delErr } = await supabase.from('trade_logs').delete().eq('trade_id', trade.trade_id);
      if (delErr) throw delErr;
      resetView();
      renderTradeLog(container);
    } catch (err) {
      alert('삭제 실패: ' + err.message);
    }
  };

  const email = await currentUserEmail();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'trade', trade.trade_id, email);
}
