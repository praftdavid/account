import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';
import { DOC_TYPES, requiresIssuer } from '../lib/letterhead.js';
import { renderLetterheadBody, openLetterheadPrint } from '../lib/letterheadPrint.js';
import { exportDocumentToDocx } from '../lib/exportDocx.js';

const STATUS_LABEL = { draft: '기안중', submitted: '결재대기', approved: '승인', rejected: '반려' };
const STATUS_BADGE = { draft: 'draft', submitted: 'draft', approved: 'ok', rejected: 'bad' };
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

  const tabs = [['all', '전체'], ['draft', '기안중'], ['submitted', '결재대기'], ['approved', '승인'], ['rejected', '반려']]
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

function issuerFieldBlock(doc) {
  return `<div style="grid-column:span 6" id="issuerWrap">
    <label>발송명의인 <span id="issuerReq" class="note"></span></label>
    <input id="f_issuer" type="text" placeholder="예: 대표이사 홍길동" value="${esc(doc?.issuer_name ?? '')}">
  </div>`;
}

async function renderForm(container) {
  const departments = await fetchDepartments({ activeOnly: true });
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
      <div style="grid-column:span 4"><label>문서종류 *</label><select id="f_type">${typeOptions}</select></div>
      <div style="grid-column:span 4"><label>기안부서 *</label><select id="f_dept">${deptOptions}</select></div>
      <div style="grid-column:span 4"><label>공개구분</label><select id="f_disclosure">${disclosureOptions}</select></div>
      <div style="grid-column:span 12"><label>제목 *</label><input id="f_title" type="text" required value="${esc(doc?.title ?? '')}"></div>
      <div style="grid-column:span 6"><label>수신(자)</label><input id="f_recipient" type="text" placeholder="예: OO기관 담당자 (기안문은 비워두면 '내부결재'로 표시)" value="${esc(doc?.recipient ?? '')}"></div>
      ${issuerFieldBlock(doc)}
      <div style="grid-column:span 12"><label>본문 *</label><textarea id="f_body" required rows="10" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(doc?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="docErr"></span>
      </div>
    </form>
    <p class="note">문서 하단에 발송명의인이 있으면 <b>시행문</b>, 없으면 <b>기안문</b>입니다. 저장 후 상세화면에서 [상신]을 눌러야 결재가 시작됩니다(문서번호는 상신 시점에 채번). 대표이사 1인 체제라 결재선 없이 상신 즉시 본인이 승인/반려를 결정합니다.</p>
  </div>`;

  const typeSel = document.getElementById('f_type');
  const syncIssuerRequirement = () => {
    const need = requiresIssuer(typeSel.value);
    document.getElementById('f_issuer').required = need;
    document.getElementById('issuerReq').textContent = need ? '(시행문은 필수)' : '(선택)';
  };
  typeSel.onchange = syncIssuerRequirement;
  syncIssuerRequirement();

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

    const payload = {
      doc_type: docType,
      dept_id: Number(document.getElementById('f_dept').value) || null,
      title: document.getElementById('f_title').value.trim(),
      recipient: document.getElementById('f_recipient').value.trim() || null,
      issuer_name: issuerName,
      disclosure: document.getElementById('f_disclosure').value,
      body: document.getElementById('f_body').value,
    };

    if (doc) {
      const { error } = await supabase.from('documents').update(payload).eq('doc_id', doc.doc_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentDocId = doc.doc_id;
    } else {
      const email = await currentUserEmail();
      const { data, error } = await supabase.from('documents').insert({ ...payload, drafter_email: email }).select().single();
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentDocId = data.doc_id;
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

  const actions = [];
  if (doc.status === 'draft') {
    actions.push('<button class="btn ghost" id="editBtn">수정</button>');
    actions.push('<button class="btn" id="submitBtn">상신</button>');
  } else if (doc.status === 'submitted') {
    actions.push('<button class="btn" id="approveBtn">승인</button>');
    actions.push('<button class="btn danger" id="rejectBtn">반려</button>');
  } else if (doc.status === 'rejected') {
    actions.push('<button class="btn ghost" id="editBtn">수정 후 재상신</button>');
  } else if (doc.status === 'approved') {
    actions.push('<button class="btn ghost" id="printBtn">인쇄</button>');
    actions.push('<button class="btn ghost" id="docxBtn">Word 다운로드</button>');
  }
  actions.push('<button class="btn ghost" id="backBtn">목록</button>');

  const deptName = deptLabel(departments, doc.dept_id) || '(부서없음)';

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <span class="badge draft">${esc(doc.doc_type)}</span>
      <span class="badge ${STATUS_BADGE[doc.status]}">${STATUS_LABEL[doc.status]}</span>
      <span class="note" style="margin-left:8px">${esc(doc.doc_no ?? '(미상신)')} · ${esc(deptName)} · 기안 ${esc(doc.drafter_email)}</span>
      <span style="margin-left:auto">${actions.join(' ')}</span>
    </div>
    ${doc.decision_note ? `<p class="note"><b>결재의견</b> — ${esc(doc.decision_note)} (${esc(doc.decided_by ?? '')}, ${doc.decided_at ? String(doc.decided_at).slice(0, 10) : ''})</p>` : ''}
  </div>
  <div class="card" style="font-family:'Batang','바탕','Malgun Gothic',serif;max-width:800px;margin-left:auto;margin-right:auto">
    ${renderLetterheadBody(doc, deptName)}
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderDocuments(container); };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => { mode = 'edit'; renderDocuments(container); };

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.onclick = () => openLetterheadPrint(doc, deptName);

  const docxBtn = document.getElementById('docxBtn');
  if (docxBtn) {
    docxBtn.onclick = async () => {
      docxBtn.disabled = true;
      try {
        await exportDocumentToDocx(doc, deptName);
      } catch (err) {
        alert('Word 생성 실패: ' + err.message);
      }
      docxBtn.disabled = false;
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
      renderDocuments(container);
    };
  }

  const email = await currentUserEmail();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'document', doc.doc_id, email);
}
