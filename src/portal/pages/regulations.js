import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';

const CATEGORIES = ['정관', '규정', '지침', '서식', '기타'];
const STATUS_LABEL = { active: '시행중', abolished: '폐지' };
const STATUS_BADGE = { active: 'ok', abolished: 'bad' };

let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentRegId = null;
let categoryFilter = 'all';

export async function renderRegulations(container) {
  if (mode === 'list') return renderList(container);
  if (mode === 'new' || mode === 'edit') return renderForm(container);
  return renderDetail(container);
}

async function renderList(container) {
  let q = supabase.from('regulations').select('*').order('category').order('title');
  if (categoryFilter !== 'all') q = q.eq('category', categoryFilter);
  const { data: regs, error } = await q;
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">규정 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const tabs = [['all', '전체'], ...CATEGORIES.map((c) => [c, c])]
    .map(([k, label]) => `<button class="btn sm ${k === categoryFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');

  const rows = regs
    .map(
      (r) => `<tr class="${r.status === 'abolished' ? 'inactive' : ''}">
        <td class="c">${esc(r.category)}</td>
        <td><a href="#" data-open="${r.reg_id}">${esc(r.title)}</a></td>
        <td class="c">${esc(r.reg_no ?? '')}</td>
        <td class="c">${esc(r.version)}</td>
        <td class="c">${r.effective_date ?? ''}</td>
        <td class="c"><span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span></td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${tabs}
      <button class="btn" id="newRegBtn" style="margin-left:auto">규정 등록</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>구분</th><th>제목</th><th>규정번호</th><th>버전</th><th>시행일</th><th>상태</th></tr>
      ${rows || '<tr><td colspan="6" class="note" style="text-align:center">등록된 규정이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { categoryFilter = b.dataset.filter; renderList(container); };
  });
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentRegId = Number(a.dataset.open); mode = 'view'; renderRegulations(container); };
  });
  document.getElementById('newRegBtn').onclick = () => { currentRegId = null; mode = 'new'; renderRegulations(container); };
}

async function renderForm(container) {
  let reg = null;
  if (mode === 'edit' && currentRegId) {
    const { data, error } = await supabase.from('regulations').select('*').eq('reg_id', currentRegId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">규정 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    reg = data;
  }

  const catOptions = CATEGORIES.map((c) => `<option value="${c}" ${reg?.category === c ? 'selected' : ''}>${c}</option>`).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${reg ? '규정 수정' : '규정 등록'}</h2>
    <form class="entry" id="regForm">
      <div style="grid-column:span 3"><label>구분 *</label><select id="f_cat">${catOptions}</select></div>
      <div style="grid-column:span 6"><label>제목 *</label><input id="f_title" required value="${esc(reg?.title ?? '')}"></div>
      <div style="grid-column:span 3"><label>규정번호</label><input id="f_no" value="${esc(reg?.reg_no ?? '')}"></div>
      <div style="grid-column:span 3"><label>버전 *</label><input id="f_ver" required value="${esc(reg?.version ?? '1.0')}"></div>
      <div style="grid-column:span 3"><label>시행일</label><input type="date" id="f_eff" value="${reg?.effective_date ?? ''}"></div>
      <div style="grid-column:span 12"><label>본문</label><textarea id="f_body" rows="12" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(reg?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="regErr"></span>
      </div>
    </form>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => {
    mode = reg ? 'view' : 'list';
    if (!reg) currentRegId = null;
    renderRegulations(container);
  };

  document.getElementById('regForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('regErr');
    errEl.textContent = '';

    const payload = {
      category: document.getElementById('f_cat').value,
      title: document.getElementById('f_title').value.trim(),
      reg_no: document.getElementById('f_no').value.trim() || null,
      version: document.getElementById('f_ver').value.trim(),
      effective_date: document.getElementById('f_eff').value || null,
      body: document.getElementById('f_body').value,
      updated_at: new Date().toISOString(),
    };

    if (reg) {
      const { error } = await supabase.from('regulations').update(payload).eq('reg_id', reg.reg_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentRegId = reg.reg_id;
    } else {
      const { data, error } = await supabase.from('regulations').insert(payload).select().single();
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentRegId = data.reg_id;
    }
    mode = 'view';
    renderRegulations(container);
  });
}

async function renderDetail(container) {
  const { data: reg, error } = await supabase.from('regulations').select('*').eq('reg_id', currentRegId).single();
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">규정 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">${esc(reg.title)}</h2>
      <span class="badge ${STATUS_BADGE[reg.status]}" style="margin-left:10px">${STATUS_LABEL[reg.status]}</span>
      <span style="margin-left:auto">
        <button class="btn ghost" id="editBtn">수정</button>
        <button class="btn ${reg.status === 'active' ? 'danger' : ''}" id="toggleBtn">${reg.status === 'active' ? '폐지' : '시행 재개'}</button>
        <button class="btn ghost" id="backBtn">목록</button>
      </span>
    </div>
    <table>
      <tr><th style="width:110px">구분</th><td>${esc(reg.category)}</td><th style="width:110px">규정번호</th><td>${esc(reg.reg_no ?? '')}</td></tr>
      <tr><th>버전</th><td>${esc(reg.version)}</td><th>시행일</th><td>${reg.effective_date ?? ''}</td></tr>
    </table>
    <div style="white-space:pre-wrap;margin-top:16px;line-height:1.8">${esc(reg.body ?? '')}</div>
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { mode = 'list'; currentRegId = null; renderRegulations(container); };
  document.getElementById('editBtn').onclick = () => { mode = 'edit'; renderRegulations(container); };
  document.getElementById('toggleBtn').onclick = async () => {
    const newStatus = reg.status === 'active' ? 'abolished' : 'active';
    const { error: toggleErr } = await supabase.from('regulations').update({ status: newStatus }).eq('reg_id', reg.reg_id);
    if (toggleErr) { alert('변경 실패: ' + toggleErr.message); return; }
    renderRegulations(container);
  };

  const { data: userData } = await supabase.auth.getUser();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'regulation', reg.reg_id, userData?.user?.email ?? null);
}
