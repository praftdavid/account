import { supabase } from '../../lib/supabaseClient.js';
import { trackHistory } from '../../lib/viewHistory.js';
import { esc } from '../../lib/util.js';
import { DOC_TYPES } from '../lib/letterhead.js';
import { fetchTemplates } from '../lib/docTemplates.js';
import { templatePlaceholders, normalizeTemplate } from '../lib/hwpx.js';

const BUCKET = 'portal-files';

let mode = 'list'; // 'list' | 'form'
let editingId = null;

export function resetView() {
  mode = 'list';
  editingId = null;
}

const TEXTAREA_STYLE = 'width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical;line-height:1.6';

// 뒤로가기(방문 기록)용: 지금 화면이 목록/작성/상세 중 무엇이고 어떤 항목인지.
export function getPageState() {
  return { mode, id: editingId };
}

export function setPageState(s) {
  mode = s?.mode ?? 'list';
  editingId = s?.id ?? null;
}

export async function renderDocTemplates(container) {
  trackHistory();
  if (mode === 'form') return renderForm(container);
  return renderList(container);
}

async function renderList(container) {
  const templates = await fetchTemplates();
  const rows = templates
    .map(
      (t) => `<tr>
        <td class="c">${esc(t.doc_type)}</td>
        <td><a href="#" data-edit="${t.template_id}">${esc(t.name)}</a>${t.hwpx_path ? ' <span class="badge draft">한글(HWPX)</span>' : ''}</td>
        <td>${esc(t.title ?? '')}</td>
        <td class="c"><button class="btn sm ghost" data-del="${t.template_id}">삭제</button></td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">서식 관리 (${templates.length}건)</h2>
      <button class="btn" id="newTplBtn" style="margin-left:auto">서식 등록</button>
    </div>
    <p class="note" style="margin:0 0 10px">자주 쓰는 문서(주주총회 소집통지, 이사회 의사록 등)를 서식으로 저장해두면 새 기안 작성 화면의 [서식 불러오기]에서 제목·수신·본문을 한 번에 채울 수 있습니다. 기안 작성 화면의 [서식으로 저장]으로도 등록됩니다.</p>
    <div style="overflow-x:auto"><table>
      <tr><th>문서종류</th><th>서식 이름</th><th>제목</th><th></th></tr>
      ${rows || '<tr><td colspan="4" class="note" style="text-align:center">등록된 서식이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('newTplBtn').onclick = () => { editingId = null; mode = 'form'; renderDocTemplates(container); };
  container.querySelectorAll('[data-edit]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); editingId = Number(a.dataset.edit); mode = 'form'; renderDocTemplates(container); };
  });
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 서식을 삭제할까요? 이미 이 서식으로 작성한 문서에는 영향이 없습니다.')) return;
      const tpl = templates.find((t) => t.template_id === Number(b.dataset.del));
      const { error } = await supabase.from('doc_templates').delete().eq('template_id', tpl.template_id);
      if (error) { alert('삭제 실패: ' + error.message); return; }
      if (tpl.hwpx_path) await supabase.storage.from(BUCKET).remove([tpl.hwpx_path]);
      renderDocTemplates(container);
    };
  });
}

async function renderForm(container) {
  let tpl = null;
  if (editingId) {
    const { data, error } = await supabase.from('doc_templates').select('*').eq('template_id', editingId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">서식 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    tpl = data;
  }
  const typeOptions = DOC_TYPES.map((t) => `<option value="${t}" ${(tpl?.doc_type ?? '기안문') === t ? 'selected' : ''}>${t}</option>`).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${tpl ? '서식 수정' : '서식 등록'}</h2>
    <form class="entry" id="tplForm">
      <div style="grid-column:span 6"><label>서식 이름 *</label><input id="t_name" type="text" required value="${esc(tpl?.name ?? '')}"></div>
      <div style="grid-column:span 3"><label>문서종류 *</label><select id="t_type">${typeOptions}</select></div>
      <div style="grid-column:span 12"><label>제목</label><input id="t_title" type="text" value="${esc(tpl?.title ?? '')}"></div>
      <div style="grid-column:span 6"><label>수신(자)</label><input id="t_recipient" type="text" value="${esc(tpl?.recipient ?? '')}"></div>
      <div style="grid-column:span 6"><label>발송명의인</label><input id="t_issuer" type="text" value="${esc(tpl?.issuer_name ?? '')}"></div>
      <div style="grid-column:span 12"><label>본문</label><textarea id="t_body" rows="14" style="${TEXTAREA_STYLE}">${esc(tpl?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12">
        <label>한글 서식 파일 (.hwp / .hwpx) <span class="note">— 선택${tpl?.hwpx_path ? ' · 이미 등록됨(새 파일을 고르면 교체)' : ''}</span></label>
        <input type="file" id="t_file" accept=".hwp,.hwpx">
        <p class="note" id="t_fileInfo">문서에서 바뀔 부분을 <b>{{일시}}</b>, <b>{{장소}}</b>처럼 중괄호 두 개로 감싸 적어 두면, 기안할 때 그 자리마다 입력칸이 생기고 입력한 값으로 채워진 한글 문서(HWPX)가 만들어집니다. 값은 한 줄만 넣을 수 있고, 글꼴은 제목 경기천년제목 Medium · 본문 경기천년바탕으로 바뀝니다.</p>
      </div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="tplErr"></span>
      </div>
    </form>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => { resetView(); renderDocTemplates(container); };
  const fileInfo = document.getElementById('t_fileInfo');
  document.getElementById('t_file').onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    fileInfo.textContent = '한글 파일을 확인하는 중…';
    try {
      const { bytes } = await normalizeTemplate(await file.arrayBuffer(), file.name);
      const keys = await templatePlaceholders(bytes);
      fileInfo.textContent = keys.length
        ? `찾은 자리표시 ${keys.length}개: ${keys.map((k) => `{{${k}}}`).join('  ')}`
        : '이 파일에는 {{자리표시}}가 없습니다. 문서에서 바뀔 부분을 {{이름}} 형태로 적은 뒤 다시 올려주세요(없어도 저장은 되지만 입력칸이 만들어지지 않습니다).';
    } catch (err) {
      fileInfo.textContent = '이 파일을 열지 못했습니다: ' + (err.message ?? err);
    }
  };
  document.getElementById('tplForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const payload = {
      name: document.getElementById('t_name').value.trim(),
      doc_type: document.getElementById('t_type').value,
      title: document.getElementById('t_title').value.trim() || null,
      recipient: document.getElementById('t_recipient').value.trim() || null,
      issuer_name: document.getElementById('t_issuer').value.trim() || null,
      body: document.getElementById('t_body').value || null,
      updated_at: new Date().toISOString(),
    };
    const errEl = document.getElementById('tplErr');
    const { data: userData } = await supabase.auth.getUser();

    let newPath = null;
    const file = document.getElementById('t_file').files[0];
    if (file) {
      errEl.style.color = 'var(--text-mute)';
      errEl.textContent = '한글 파일 저장 중…';
      try {
        const { bytes, loss } = await normalizeTemplate(await file.arrayBuffer(), file.name);
        if (loss.length && !confirm(`HWPX로 바꾸는 중 일부 내용(${loss.length}건)이 빠질 수 있습니다. 그래도 저장할까요?`)) { errEl.textContent = ''; return; }
        newPath = `template/${Date.now()}_${crypto.randomUUID()}.hwpx`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, new Blob([bytes], { type: "application/octet-stream" }));
        if (upErr) throw upErr;
        payload.hwpx_path = newPath;
      } catch (err) {
        errEl.style.color = '';
        errEl.textContent = '한글 파일 처리 실패: ' + (err.message ?? err);
        return;
      }
      errEl.textContent = '';
    }

    const { error } = tpl
      ? await supabase.from('doc_templates').update(payload).eq('template_id', tpl.template_id)
      : await supabase.from('doc_templates').insert({ ...payload, created_by: userData?.user?.email ?? null });
    if (error) {
      if (newPath) await supabase.storage.from(BUCKET).remove([newPath]);
      errEl.style.color = '';
      errEl.textContent = '저장 실패: ' + error.message;
      return;
    }
    if (newPath && tpl?.hwpx_path) await supabase.storage.from(BUCKET).remove([tpl.hwpx_path]);
    resetView();
    renderDocTemplates(container);
  });
}
