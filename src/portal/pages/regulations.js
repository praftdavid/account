import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget, uploadAttachment, listAttachments, isPdfAttachment, getSignedUrl } from '../../lib/attachments.js';
import { retentionDeadline } from '../lib/retention.js';

const CATEGORIES = ['정관', '규정', '지침', '기타'];
const STATUS_LABEL = { active: '시행중', abolished: '폐지' };
const STATUS_BADGE = { active: 'ok', abolished: 'bad' };

let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentRegId = null;
let categoryFilter = 'all';
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentRegId = null;
}

function yearOf(reg) {
  const d = reg.effective_date ?? reg.created_at;
  return d ? Number(String(d).slice(0, 4)) : null;
}

export async function renderRegulations(container) {
  if (mode === 'list') return renderList(container);
  if (mode === 'new' || mode === 'edit') return renderForm(container);
  return renderDetail(container);
}

async function renderList(container) {
  const { data: allRegs, error } = await supabase.from('regulations').select('*').order('category').order('title');
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">규정 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allRegs.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());

  const regs = allRegs.filter(
    (r) => (categoryFilter === 'all' || r.category === categoryFilter) && (yearFilter === 'all' || yearOf(r) === Number(yearFilter))
  );

  const tabs = [['all', '전체'], ...CATEGORIES.map((c) => [c, c])]
    .map(([k, label]) => `<button class="btn sm ${k === categoryFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');

  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

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
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
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
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderList(container); };
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
      <div style="grid-column:span 6"><label>제목 *</label><input id="f_title" type="text" required value="${esc(reg?.title ?? '')}"></div>
      <div style="grid-column:span 3"><label>규정번호</label><input id="f_no" type="text" value="${esc(reg?.reg_no ?? '')}"></div>
      <div style="grid-column:span 3"><label>버전 *</label><input id="f_ver" type="text" required value="${esc(reg?.version ?? '1.0')}"></div>
      <div style="grid-column:span 3"><label>시행일</label><input type="date" id="f_eff" value="${reg?.effective_date ?? ''}"></div>
      <div style="grid-column:span 12">
        ${reg ? '<div id="existingAttWrap"></div>' : ''}
        <label>규정 파일 ${reg ? '추가' : ''}</label><input type="file" id="f_attachments" multiple>
        <p class="note">규정·정관 PDF, 한글·워드 파일을 여기서 첨부하세요. 제규정은 문서 내용을 직접 입력하는 곳이 아니라, 이미 작성된 규정 파일을 등록·관리하는 메뉴입니다.</p>
      </div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="regErr"></span>
      </div>
    </form>
  </div>`;

  if (reg) {
    const { data: userData } = await supabase.auth.getUser();
    renderAttachmentsWidget(document.getElementById('existingAttWrap'), 'regulation', reg.reg_id, userData?.user?.email ?? null, {
      allowUpload: false,
      allowDelete: true,
    });
  }

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
      reg = data; // 첨부파일 업로드 실패로 폼에 머무른 채 재제출해도 중복 생성되지 않도록 갱신
    }

    const files = [...document.getElementById('f_attachments').files];
    if (files.length > 0) {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email ?? null;
      errEl.textContent = `첨부파일 업로드 중… (0/${files.length})`;
      for (const [i, file] of files.entries()) {
        try {
          await uploadAttachment('regulation', currentRegId, file, email);
          errEl.textContent = `첨부파일 업로드 중… (${i + 1}/${files.length})`;
        } catch (err) {
          errEl.textContent = `"${file.name}" 첨부 실패: ${err.message} (규정 정보는 저장되었습니다)`;
          return;
        }
      }
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

  // 제규정은 본문을 직접 타이핑하는 화면이 아니라 이미 만들어진 규정 파일을 등록해두는
  // 메뉴라, "미리보기"는 타이핑된 본문 대신 첨부된 규정 PDF 자체를 그대로 화면에 띄운다.
  const atts = await listAttachments('regulation', reg.reg_id);
  const pdfAtts = atts.filter(isPdfAttachment);
  const pdfPreviews = await Promise.all(
    pdfAtts.map(async (a) => ({ file_name: a.file_name, url: await getSignedUrl(a).catch(() => null) }))
  );

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
  </div>
  <div class="card">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="width:25%;padding:4px 0">구분 : ${esc(reg.category)}</td><td style="padding:4px 0">규정번호 : ${esc(reg.reg_no ?? '')}</td></tr>
      <tr><td style="padding:4px 0">버전 : ${esc(reg.version)}</td><td style="padding:4px 0">시행일 : ${reg.effective_date ?? ''}</td></tr>
    </table>
    <p class="note" style="margin-top:10px">보존기한 : ${esc(retentionDeadline(reg.created_at))}</p>
  </div>
  ${
    pdfPreviews.length > 0
      ? pdfPreviews
          .map(
            (p) => `<div class="card">
        <h3>${esc(p.file_name)}</h3>
        ${p.url ? `<iframe src="${esc(p.url)}" style="width:100%;height:80vh;border:1px solid var(--bd);border-radius:var(--radius-sm)"></iframe>` : '<p class="err">미리보기 URL을 가져오지 못했습니다.</p>'}
      </div>`
          )
          .join('')
      : '<div class="card"><p class="note">첨부된 규정 PDF가 없습니다. 아래에서 파일을 첨부해 주세요.</p></div>'
  }
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderRegulations(container); };
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
