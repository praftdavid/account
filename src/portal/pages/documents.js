import { supabase } from '../../lib/supabaseClient.js';
import { esc, todayStr } from '../../lib/util.js';
import { renderAttachmentsWidget, uploadAttachment, listAttachments, deleteAttachment } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';
import { DOC_TYPES, requiresIssuer, isExternalDoc, FONT_BODY } from '../lib/letterhead.js';
import { renderLetterheadBody } from '../lib/letterheadPrint.js';
import { exportElementToPdf } from '../lib/exportPdf.js';
import { retentionDeadline } from '../lib/retention.js';
import { logDocEvent, listDocEvents, EVENT_LABEL } from '../lib/docEvents.js';
import { fetchTemplates } from '../lib/docTemplates.js';
import { templatePlaceholders, buildHwpxFromTemplate } from '../lib/hwpx.js';
import { fetchSeal, fetchActiveSeal, loadSealImage, sealDocument } from '../lib/seal.js';

const STATUS_LABEL = { draft: '기안중', submitted: '결재대기', approved: '승인', rejected: '반려', recalled: '회수됨' };
const STATUS_BADGE = { draft: 'draft', submitted: 'draft', approved: 'ok', rejected: 'bad', recalled: 'bad' };
const DISCLOSURE_TYPES = ['공개', '부분공개', '비공개'];

// 화면 내부 상태 — main.js가 매번 새 컨테이너로 renderDocuments(container)만 호출하므로
// 목록/작성/상세 어느 화면을 보여줄지는 모듈 스코프 변수로 기억한다(다른 페이지 accounts.js의
// editingId 패턴과 동일). 탭을 벗어났다 돌아오면 항상 목록부터 보이도록 resetView()를 둔다.
let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentDocId = null;
let statusFilter = 'all';
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentDocId = null;
}

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

// 문서번호는 레터헤드 양식의 "시행 : {부서명}_{연도}{일련번호}" 표기를 그대로 doc_no로 쓴다
// (예: 경영지원팀_202601). 연도가 바뀌면 자연히 새 접두사로 1부터 다시 채번된다.
async function nextDocNo(deptName) {
  const year = new Date().getFullYear();
  const prefix = `${deptName}_${year}`;
  const { data, error } = await supabase.from('documents').select('doc_no').like('doc_no', `${prefix}%`);
  if (error) throw error;
  const maxSeq = (data ?? []).reduce((max, d) => {
    const seq = Number(String(d.doc_no).slice(prefix.length));
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
}

function deptLabel(departments, deptId) {
  const d = departments.find((x) => x.dept_id === deptId);
  return d ? d.dept_name : '';
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

export async function renderDocuments(container) {
  if (mode === 'list') return renderList(container);
  if (mode === 'new' || mode === 'edit') return renderForm(container);
  return renderDetail(container);
}

async function renderList(container) {
  const departments = await fetchDepartments();
  const { data: allDocs, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">문서 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allDocs.map((d) => yearOf(d.created_at)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());

  const docs = allDocs.filter(
    (d) => (statusFilter === 'all' || d.status === statusFilter) && (yearFilter === 'all' || yearOf(d.created_at) === Number(yearFilter))
  );

  const tabs = [['all', '전체'], ['draft', '기안중'], ['submitted', '결재대기'], ['approved', '승인'], ['rejected', '반려'], ['recalled', '회수됨']]
    .map(([k, label]) => `<button class="btn sm ${k === statusFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');

  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = docs
    .map(
      (d) => `<tr>
        <td>${esc(d.doc_no ?? '(미상신)')}</td>
        <td class="c">${esc(d.doc_type)}</td>
        <td><a href="#" data-open="${d.doc_id}">${esc(d.title)}</a></td>
        <td class="c">${esc(deptLabel(departments, d.dept_id))}</td>
        <td class="c"><span class="badge ${STATUS_BADGE[d.status]}">${STATUS_LABEL[d.status]}</span></td>
        <td class="c">${String(d.created_at).slice(0, 10)}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${tabs}
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn" id="newDocBtn" style="margin-left:auto">새 기안</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>문서번호</th><th>종류</th><th>제목</th><th>부서</th><th>상태</th><th>작성일</th></tr>
      ${rows || '<tr><td colspan="6" class="note" style="text-align:center">문서가 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { statusFilter = b.dataset.filter; renderList(container); };
  });
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderList(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentDocId = Number(a.dataset.open); mode = 'view'; renderDocuments(container); };
  });
  document.getElementById('newDocBtn').onclick = () => { currentDocId = null; mode = 'new'; renderDocuments(container); };
}

function officialFieldsBlock(doc) {
  return `<div class="grid" id="officialWrap" style="grid-template-columns:1fr 1fr;grid-column:span 12;margin:0 0 4px">
    <div><label>수신(자)</label><input id="f_recipient" type="text" placeholder="예: OO기관 담당자 (기안문은 비워두면 '내부결재'로 표시)" value="${esc(doc?.recipient ?? '')}"></div>
    <div><label>발송명의인 <span id="issuerReq" class="note"></span></label><input id="f_issuer" type="text" placeholder="예: 대표이사 홍길동" value="${esc(doc?.issuer_name ?? '')}"></div>
  </div>`;
}

async function renderForm(container) {
  const [departments, templates] = await Promise.all([
    fetchDepartments({ activeOnly: true }),
    fetchExpenseAccounts(),
    fetchTemplates().catch(() => []),
  ]);
  let doc = null;
  if (mode === 'edit' && currentDocId) {
    const { data, error } = await supabase.from('documents').select('*').eq('doc_id', currentDocId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">문서 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    doc = data;
  }

  const typeOptions = DOC_TYPES.map((t) => `<option value="${t}" ${(doc?.doc_type ?? '기안문') === t ? 'selected' : ''}>${t}</option>`).join('');
  const deptOptions = departments
    .map((d) => `<option value="${d.dept_id}" ${doc?.dept_id === d.dept_id ? 'selected' : ''}>${esc(d.dept_name)}</option>`)
    .join('');
  const disclosureOptions = DISCLOSURE_TYPES.map(
    (d) => `<option value="${d}" ${(doc?.disclosure ?? '공개') === d ? 'selected' : ''}>${d}</option>`
  ).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${doc ? '기안 수정' : '새 기안 작성'}</h2>
    <form class="entry" id="docForm">
      ${
        doc
          ? ''
          : `<div style="grid-column:span 12"><label>서식 불러오기</label>
        <select id="f_template" style="width:100%"><option value="">(서식 선택 — 제목·수신·본문을 채워줍니다)</option>${templates.map((t) => `<option value="${t.template_id}">[${esc(t.doc_type)}] ${esc(t.name)}${t.hwpx_path ? ' · 한글' : ''}</option>`).join('')}</select></div>
      <div id="hwpxBlock" style="grid-column:span 12" hidden></div>`
      }
      <div style="grid-column:span 4"><label>문서종류 *</label><select id="f_type">${typeOptions}</select></div>
      <div style="grid-column:span 4"><label>기안부서 *</label><select id="f_dept">${deptOptions}</select></div>
      <div style="grid-column:span 4"><label>공개구분</label><select id="f_disclosure">${disclosureOptions}</select></div>
      <div style="grid-column:span 12"><label>제목 *</label><input id="f_title" type="text" required value="${esc(doc?.title ?? '')}"></div>
      ${officialFieldsBlock(doc)}
      <div style="grid-column:span 12"><label>본문 *</label><textarea id="f_body" required rows="10" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(doc?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12">
        ${doc ? '<div id="existingAttWrap"></div>' : ''}
        <label>첨부파일 ${doc ? '추가' : ''}</label><input type="file" id="f_attachments" multiple>
        <p class="note">PDF·HWPX 등 형식 제한 없이 여러 개를 함께 첨부할 수 있습니다. 통지서·회의안처럼 본문과 같이 올릴 파일을 여기서 바로 선택하세요.</p>
      </div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <button class="btn ghost" type="button" id="saveTemplateBtn" style="margin-left:auto">서식으로 저장</button>
        <span class="err" id="docErr"></span>
      </div>
    </form>
    <p class="note">문서 하단에 발송명의인이 있으면 <b>시행문</b>, 없으면 <b>기안문</b>입니다. 저장 후 상세화면에서 [상신]을 눌러야 결재가 시작됩니다(문서번호는 상신 시점에 채번). 대표이사 1인 체제라 결재선 없이 상신 즉시 본인이 승인/반려를 결정합니다.</p>
  </div>`;

  if (doc) {
    const email = await currentUserEmail();
    renderAttachmentsWidget(document.getElementById('existingAttWrap'), 'document', doc.doc_id, email, {
      allowUpload: false,
      allowDelete: true,
    });
  }

  const typeSel = document.getElementById('f_type');
  const syncFieldVisibility = () => {
    const need = requiresIssuer(typeSel.value);
    document.getElementById('f_issuer').required = need;
    document.getElementById('issuerReq').textContent = need ? '(시행문은 필수)' : '(수신자가 없는 내부 기안에는 표시되지 않음)';
  };
  typeSel.onchange = syncFieldVisibility;
  syncFieldVisibility();

  // 한글(HWPX) 서식을 고르면 템플릿의 {{자리표시}}마다 입력칸을 만들고, 저장할 때 그 값으로 채운
  // HWPX를 만들어 첨부로 붙인다. pendingHwpx는 문서만 저장되고 첨부가 실패했을 때 재시도용으로 남긴다.
  let hwpxTemplate = null;
  let pendingHwpx = null;
  const bodyInput = document.getElementById('f_body');
  const hwpxBlock = document.getElementById('hwpxBlock');
  const templateSel = document.getElementById('f_template');
  if (templateSel) {
    templateSel.onchange = async () => {
      const t = templates.find((x) => x.template_id === Number(templateSel.value));
      hwpxTemplate = null;
      pendingHwpx = null;
      hwpxBlock.hidden = true;
      hwpxBlock.innerHTML = '';
      bodyInput.required = true;
      if (!t) return;
      if (bodyInput.value.trim() && !confirm('작성 중인 내용이 서식 내용으로 바뀝니다. 계속할까요?')) { templateSel.value = ''; return; }
      typeSel.value = t.doc_type;
      syncFieldVisibility();
      document.getElementById('f_title').value = t.title ?? '';
      document.getElementById('f_recipient').value = t.recipient ?? '';
      document.getElementById('f_issuer').value = t.issuer_name ?? '';
      bodyInput.value = t.body ?? '';
      if (!t.hwpx_path) return;

      hwpxBlock.hidden = false;
      hwpxBlock.innerHTML = '<p class="note">한글 서식을 불러오는 중…</p>';
      try {
        const { data: signed, error: signErr } = await supabase.storage.from('portal-files').createSignedUrl(t.hwpx_path, 3600);
        if (signErr) throw signErr;
        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error(`서식 파일을 불러오지 못했습니다 (${res.status})`);
        const bytes = await res.arrayBuffer();
        const keys = await templatePlaceholders(bytes);
        hwpxTemplate = { bytes, keys };
        bodyInput.required = false;
        hwpxBlock.innerHTML = keys.length
          ? `<label>한글 문서 입력칸 <span class="note">— 입력한 값으로 채운 HWPX가 첨부로 만들어집니다(한 줄씩 입력, 본문은 문서 글자로 자동 채워짐)</span></label>
             <div class="grid" style="grid-template-columns:1fr 1fr;margin:6px 0 0">${keys
               .map((k) => `<div><label>${esc(k)} *</label><input type="text" data-ph="${esc(k)}"></div>`)
               .join('')}</div>`
          : '<p class="note">이 서식에는 {{자리표시}}가 없어 문서가 그대로 첨부됩니다.</p>';
      } catch (err) {
        hwpxBlock.innerHTML = `<p class="err">한글 서식을 열지 못했습니다: ${esc(err.message ?? String(err))}</p>`;
      }
    };
  }

  document.getElementById('saveTemplateBtn').onclick = async () => {
    const errEl = document.getElementById('docErr');
    errEl.textContent = '';
    const name = prompt('서식 이름을 입력하세요 (예: 임시주주총회 소집통지)');
    if (!name?.trim()) return;
    const { error } = await supabase.from('doc_templates').insert({
      name: name.trim(),
      doc_type: typeSel.value,
      title: document.getElementById('f_title').value.trim() || null,
      recipient: document.getElementById('f_recipient').value.trim() || null,
      issuer_name: document.getElementById('f_issuer').value.trim() || null,
      body: document.getElementById('f_body').value || null,
      created_by: await currentUserEmail(),
    });
    if (error) { errEl.textContent = '서식 저장 실패: ' + error.message; return; }
    alert(`"${name.trim()}" 서식으로 저장했습니다. 다음 기안부터 [서식 불러오기]에서 쓸 수 있습니다.`);
  };

  document.getElementById('cancelBtn').onclick = () => {
    mode = doc ? 'view' : 'list';
    if (!doc) currentDocId = null;
    renderDocuments(container);
  };

  document.getElementById('docForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('docErr');
    errEl.textContent = '';

    const docType = document.getElementById('f_type').value;
    const issuerName = document.getElementById('f_issuer').value.trim() || null;
    if (requiresIssuer(docType) && !issuerName) {
      errEl.textContent = '시행문은 발송명의인을 입력해야 합니다.';
      return;
    }

    if (hwpxTemplate && !doc && !pendingHwpx) {
      const values = {};
      container.querySelectorAll('[data-ph]').forEach((input) => { values[input.dataset.ph] = input.value; });
      const emptyKey = Object.keys(values).find((k) => !values[k].trim());
      if (emptyKey) { errEl.textContent = `한글 문서 입력칸 "${emptyKey}"을(를) 입력해 주세요.`; return; }
      errEl.textContent = '한글 문서를 만드는 중…';
      try {
        const built = await buildHwpxFromTemplate(hwpxTemplate.bytes, values);
        if (built.loss.length && !confirm(`한글 문서를 만드는 중 일부 내용(${built.loss.length}건)이 빠질 수 있습니다. 그래도 저장할까요?`)) {
          errEl.textContent = '';
          return;
        }
        const safe = (document.getElementById('f_title').value.trim() || '문서').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
        pendingHwpx = { file: new File([built.bytes], `${safe}.hwpx`, { type: 'application/octet-stream' }), text: built.text };
      } catch (err) {
        errEl.textContent = '한글 문서 생성 실패: ' + (err.message ?? err);
        return;
      }
      errEl.textContent = '';
    }

    const payload = {
      doc_type: docType,
      dept_id: Number(document.getElementById('f_dept').value) || null,
      title: document.getElementById('f_title').value.trim(),
      disclosure: document.getElementById('f_disclosure').value,
      body: document.getElementById('f_body').value || pendingHwpx?.text || '',
      recipient: document.getElementById('f_recipient').value.trim() || null,
      issuer_name: issuerName,
    };

    const email = await currentUserEmail();
    if (doc) {
      const { error } = await supabase.from('documents').update(payload).eq('doc_id', doc.doc_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentDocId = doc.doc_id;
    } else {
      const { data, error } = await supabase.from('documents').insert({ ...payload, drafter_email: email }).select().single();
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentDocId = data.doc_id;
      await logDocEvent(data.doc_id, 'create');
      doc = data; // 첨부파일 업로드 실패로 폼에 머무른 채 재제출해도 중복 생성되지 않도록 갱신
    }

    const files = [...(pendingHwpx ? [pendingHwpx.file] : []), ...document.getElementById('f_attachments').files];
    if (files.length > 0) {
      errEl.textContent = `첨부파일 업로드 중… (0/${files.length})`;
      for (const [i, file] of files.entries()) {
        try {
          await uploadAttachment('document', currentDocId, file, email);
          if (pendingHwpx && file === pendingHwpx.file) pendingHwpx = null;
          errEl.textContent = `첨부파일 업로드 중… (${i + 1}/${files.length})`;
        } catch (err) {
          errEl.textContent = `"${file.name}" 첨부 실패: ${err.message} (본문은 저장되었습니다)`;
          return;
        }
      }
    }

    mode = 'view';
    renderDocuments(container);
  });
}

async function renderDetail(container) {
  const [{ data: doc, error }, departments] = await Promise.all([
    supabase.from('documents').select('*').eq('doc_id', currentDocId).single(),
    fetchDepartments(),
  ]);
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">문서 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }
  const events = await listDocEvents(doc.doc_id).catch(() => []);

  // 날인된 문서는 직인 이미지를 받아 와서 화면·PDF에 같이 쓴다. 이미지 로딩이 실패해도
  // 문서 열람은 막지 않는다.
  let sealInfo = null;
  let sealImg = null;
  if (doc.seal_id) {
    sealInfo = await fetchSeal(doc.seal_id);
    sealImg = sealInfo ? await loadSealImage(sealInfo).catch(() => null) : null;
  }
  const canSeal = doc.status === 'approved' && !doc.seal_id && isExternalDoc(doc) && !!doc.issuer_name?.trim();

  const actions = [];
  if (doc.status === 'draft') {
    actions.push('<button class="btn ghost" id="editBtn">수정</button>');
    actions.push('<button class="btn" id="submitBtn">상신</button>');
  } else if (doc.status === 'submitted') {
    actions.push('<button class="btn" id="approveBtn">승인</button>');
    actions.push('<button class="btn danger" id="rejectBtn">반려</button>');
    actions.push('<button class="btn ghost" id="recallBtn">회수</button>');
  } else if (doc.status === 'rejected') {
    actions.push('<button class="btn ghost" id="editBtn">수정</button>');
    actions.push('<button class="btn" id="submitBtn">재상신</button>');
  } else if (doc.status === 'approved') {
    if (canSeal) actions.push('<button class="btn" id="sealBtn">직인 날인</button>');
    actions.push('<button class="btn ghost" id="pdfBtn">PDF 저장</button>');
    actions.push('<button class="btn ghost" id="hwpxBtn">한글(HWPX) 저장</button>');
    actions.push('<button class="btn danger" id="recallApprovedBtn">회수</button>');
  } else if (doc.status === 'recalled') {
    actions.push('<button class="btn ghost" id="pdfBtn">PDF 저장</button>');
    actions.push('<button class="btn ghost" id="hwpxBtn">한글(HWPX) 저장</button>');
  }
  actions.push('<button class="btn ghost" id="backBtn">목록</button>');

  const deptName = deptLabel(departments, doc.dept_id) || '(부서없음)';
  const noteLabel = doc.status === 'recalled' ? '회수 사유' : doc.status === 'rejected' ? '반려 사유' : '결재의견';

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <span class="badge draft">${esc(doc.doc_type)}</span>
      <span class="badge ${STATUS_BADGE[doc.status]}">${STATUS_LABEL[doc.status]}</span>
      <span class="note" style="margin-left:8px">${esc(doc.doc_no ?? '(미상신)')} · ${esc(deptName)} · 기안 ${esc(doc.drafter_email)} · 보존기한 ${esc(retentionDeadline(doc.created_at))}</span>
      <span style="margin-left:auto">${actions.join(' ')}</span>
    </div>
    ${doc.decision_note ? `<p class="note"><b>${noteLabel}</b> — ${esc(doc.decision_note)} (${esc(doc.decided_by ?? '')}, ${doc.decided_at ? String(doc.decided_at).slice(0, 10) : ''})</p>` : ''}
    ${sealInfo ? `<p class="note"><b>직인 날인</b> — ${esc(sealInfo.name)} (${esc(doc.sealed_by ?? '')}, ${String(doc.sealed_at).slice(0, 16).replace('T', ' ')})</p>` : ''}
  </div>
  <div class="card" id="letterheadBody" style="font-family:${FONT_BODY};max-width:800px;margin-left:auto;margin-right:auto">
    ${renderLetterheadBody(doc, deptName, sealImg?.dataUrl ?? null)}
  </div>
  <div class="card">
    <h3>결재 이력</h3>
    <div style="overflow-x:auto"><table>
      <tr><th>일시</th><th>처리</th><th>처리자</th><th>비고</th></tr>
      ${
        events.length
          ? events
              .map(
                (e) => `<tr>
          <td class="c">${String(e.created_at).slice(0, 16).replace('T', ' ')}</td>
          <td class="c">${esc(EVENT_LABEL[e.event_type] ?? e.event_type)}</td>
          <td class="c">${esc(e.actor_email ?? '')}</td>
          <td style="white-space:pre-wrap">${esc(e.note ?? '')}</td>
        </tr>`
              )
              .join('')
          : '<tr><td colspan="4" class="note" style="text-align:center">기록된 이력이 없습니다.</td></tr>'
      }
    </table></div>
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderDocuments(container); };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => { mode = 'edit'; renderDocuments(container); };

  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) {
    pdfBtn.onclick = async () => {
      pdfBtn.disabled = true;
      try {
        await exportElementToPdf(document.getElementById('letterheadBody'), `${doc.doc_no ?? doc.title}.pdf`);
      } catch (err) {
        alert('PDF 생성 실패: ' + err.message);
      }
      pdfBtn.disabled = false;
    };
  }

  // 직접 쓴 문서도 편집 가능한 한글 파일로 내려받을 수 있게 공문서 모양의 HWPX를 만든다(Word 대신).
  const hwpxBtn = document.getElementById('hwpxBtn');
  if (hwpxBtn) {
    hwpxBtn.onclick = async () => {
      hwpxBtn.disabled = true;
      const label = hwpxBtn.textContent;
      hwpxBtn.textContent = '만드는 중…';
      try {
        const { downloadLetterheadHwpx } = await import('../lib/hwpx.js');
        const safe = (doc.doc_no ?? doc.title).replace(/[\\/:*?"<>|]/g, '_');
        const loss = await downloadLetterheadHwpx(doc, deptName, sealImg?.dataUrl ?? null, `${safe}.hwpx`);
        if (loss.length) alert(`한글 파일을 만드는 중 일부 내용(${loss.length}건)이 빠졌을 수 있습니다. 한글에서 열어 확인해 주세요.`);
      } catch (err) {
        alert('한글 파일 생성 실패: ' + (err.message ?? err));
      }
      hwpxBtn.textContent = label;
      hwpxBtn.disabled = false;
    };
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.onclick = async () => {
      submitBtn.disabled = true;
      try {
        const doc_no = doc.doc_no ?? (await nextDocNo(deptName));
        const { error: subErr } = await supabase
          .from('documents')
          .update({ doc_no, status: 'submitted', submitted_at: new Date().toISOString(), decided_at: null, decided_by: null, decision_note: null })
          .eq('doc_id', doc.doc_id);
        if (subErr) throw subErr;
        await logDocEvent(doc.doc_id, doc.status === 'rejected' ? 'resubmit' : 'submit', doc_no);
        renderDocuments(container);
      } catch (err) {
        alert('상신 실패: ' + err.message);
        submitBtn.disabled = false;
      }
    };
  }

  const approveBtn = document.getElementById('approveBtn');
  if (approveBtn) {
    approveBtn.onclick = async () => {
      approveBtn.disabled = true;
      const email = await currentUserEmail();
      const { error: appErr } = await supabase
        .from('documents')
        .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: email })
        .eq('doc_id', doc.doc_id);
      if (appErr) { alert('승인 실패: ' + appErr.message); approveBtn.disabled = false; return; }
      await logDocEvent(doc.doc_id, 'approve');
      renderDocuments(container);
    };
  }

  const rejectBtn = document.getElementById('rejectBtn');
  if (rejectBtn) {
    rejectBtn.onclick = async () => {
      const note = prompt('반려 사유를 입력하세요(선택)');
      if (note === null) return;
      const email = await currentUserEmail();
      const { error: rejErr } = await supabase
        .from('documents')
        .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: email, decision_note: note || null })
        .eq('doc_id', doc.doc_id);
      if (rejErr) { alert('반려 처리 실패: ' + rejErr.message); return; }
      await logDocEvent(doc.doc_id, 'reject', note);
      renderDocuments(container);
    };
  }

  // 결재선이 대표이사 1인뿐이라 별도 "회수" 상태 없이, 승인/반려 전 상신을 취소하고 싶으면
  // 문서를 통째로 삭제해 처음부터 다시 기안하게 한다(첨부파일도 스토리지까지 함께 정리).
  const recallBtn = document.getElementById('recallBtn');
  if (recallBtn) {
    recallBtn.onclick = async () => {
      if (!confirm('이 기안을 회수할까요? 회수하면 문서와 첨부파일이 모두 삭제되며 되돌릴 수 없습니다.')) return;
      recallBtn.disabled = true;
      try {
        const atts = await listAttachments('document', doc.doc_id);
        for (const a of atts) await deleteAttachment(a);
        const { error: delErr } = await supabase.from('documents').delete().eq('doc_id', doc.doc_id);
        if (delErr) throw delErr;
        resetView();
        renderDocuments(container);
      } catch (err) {
        alert('회수 실패: ' + err.message);
        recallBtn.disabled = false;
      }
    };
  }

  // 승인(시행)까지 끝난 문서는 이미 문서번호가 나가 대외적으로 유효했던 기록이라, 위의
  // 상신 취소와 달리 삭제하지 않는다 — 상태만 "회수됨"으로 바꿔 원문과 회수 사유를 그대로
  // 남긴다(보존기한 문서를 안전 이유 없이 지우지 않는다는 원칙과 동일).
  const recallApprovedBtn = document.getElementById('recallApprovedBtn');
  if (recallApprovedBtn) {
    recallApprovedBtn.onclick = async () => {
      const reason = prompt('시행된 문서를 회수합니다. 회수 사유를 입력하세요(필수).');
      if (reason === null) return;
      if (!reason.trim()) { alert('회수 사유를 입력해야 합니다.'); return; }
      recallApprovedBtn.disabled = true;
      const email = await currentUserEmail();
      const { error: recallErr } = await supabase
        .from('documents')
        .update({ status: 'recalled', decided_at: new Date().toISOString(), decided_by: email, decision_note: reason.trim() })
        .eq('doc_id', doc.doc_id);
      if (recallErr) { alert('회수 실패: ' + recallErr.message); recallApprovedBtn.disabled = false; return; }
      await logDocEvent(doc.doc_id, 'recall', reason.trim());
      renderDocuments(container);
    };
  }

  const sealBtn = document.getElementById('sealBtn');
  if (sealBtn) {
    sealBtn.onclick = async () => {
      const seal = await fetchActiveSeal();
      if (!seal) { alert('사용 중인 직인이 없습니다. [기초정보 > 직인관리]에서 직인을 등록하고 사용 지정해 주세요.'); return; }
      if (!confirm(`"${seal.name}" 직인을 날인합니다. 날인 후에는 취소할 수 없고 날인기록부에 남습니다. 진행할까요?`)) return;
      sealBtn.disabled = true;
      try {
        await sealDocument(doc, seal, await currentUserEmail());
        renderDocuments(container);
      } catch (err) {
        alert('날인 실패: ' + err.message);
        sealBtn.disabled = false;
      }
    };
  }

  const email = await currentUserEmail();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'document', doc.doc_id, email, {
    allowUpload: false,
    allowDelete: false,
  });
}
