import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';
import { SCOPE_LABEL } from '../lib/letterhead.js';
import { openLetterheadPrint } from '../lib/letterheadPrint.js';
import { exportDocumentToDocx } from '../lib/exportDocx.js';

const STATUS_LABEL = { draft: '기안중', submitted: '결재대기', approved: '승인', rejected: '반려' };
const STATUS_BADGE = { draft: 'draft', submitted: 'draft', approved: 'ok', rejected: 'bad' };
const DOC_TYPES = ['기안서', '품의서', '지출결의서', '휴가신청서', '업무보고서', '기타'];
const DISCLOSURE_TYPES = ['공개', '부분공개', '비공개'];

// 화면 내부 상태 — main.js가 매번 새 컨테이너로 renderDocuments(container)만 호출하므로
// 목록/작성/상세 어느 화면을 보여줄지는 모듈 스코프 변수로 기억한다(다른 페이지 accounts.js의
// editingId 패턴과 동일).
let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentDocId = null;
let statusFilter = 'all';

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

// 문서번호는 레터헤드 양식의 "시행 : {부서명}_{연도}{일련번호}" 표기를 그대로 doc_no로 쓴다
// (예: 대표이사실_202601). 연도가 바뀌면 자연히 새 접두사로 1부터 다시 채번된다.
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

export async function renderDocuments(container) {
  if (mode === 'list') return renderList(container);
  if (mode === 'new' || mode === 'edit') return renderForm(container);
  return renderDetail(container);
}

async function renderList(container) {
  const departments = await fetchDepartments();
  let q = supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (statusFilter !== 'all') q = q.eq('status', statusFilter);
  const { data: docs, error } = await q;
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">문서 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const tabs = [['all', '전체'], ['draft', '기안중'], ['submitted', '결재대기'], ['approved', '승인'], ['rejected', '반려']]
    .map(([k, label]) => `<button class="btn sm ${k === statusFilter ? '' : 'ghost'}" data-filter="${k}">${label}</button>`)
    .join('');

  const rows = docs
    .map(
      (d) => `<tr>
        <td>${esc(d.doc_no ?? '(미상신)')}</td>
        <td class="c">${esc(SCOPE_LABEL[d.doc_scope] ?? SCOPE_LABEL.internal)}</td>
        <td>${esc(d.doc_type)}</td>
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
      <button class="btn" id="newDocBtn" style="margin-left:auto">새 기안</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>문서번호</th><th>기안/시행</th><th>구분</th><th>제목</th><th>부서</th><th>상태</th><th>작성일</th></tr>
      ${rows || '<tr><td colspan="7" class="note" style="text-align:center">문서가 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  container.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { statusFilter = b.dataset.filter; renderList(container); };
  });
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentDocId = Number(a.dataset.open); mode = 'view'; renderDocuments(container); };
  });
  document.getElementById('newDocBtn').onclick = () => { currentDocId = null; mode = 'new'; renderDocuments(container); };
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

  const typeOptions = DOC_TYPES.map((t) => `<option value="${t}" ${doc?.doc_type === t ? 'selected' : ''}>${t}</option>`).join('');
  const deptOptions = departments
    .map((d) => `<option value="${d.dept_id}" ${doc?.dept_id === d.dept_id ? 'selected' : ''}>${esc(d.dept_name)}</option>`)
    .join('');
  const scope = doc?.doc_scope ?? 'internal';
  const scopeOptions = Object.entries(SCOPE_LABEL)
    .map(([k, label]) => `<option value="${k}" ${scope === k ? 'selected' : ''}>${label} (${k === 'internal' ? '내부' : '타기관 발송'})</option>`)
    .join('');
  const disclosureOptions = DISCLOSURE_TYPES.map(
    (d) => `<option value="${d}" ${(doc?.disclosure ?? '공개') === d ? 'selected' : ''}>${d}</option>`
  ).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${doc ? '기안 수정' : '새 기안 작성'}</h2>
    <form class="entry" id="docForm">
      <div style="grid-column:span 4"><label>기안/시행 *</label><select id="f_scope">${scopeOptions}</select></div>
      <div style="grid-column:span 4"><label>문서구분 *</label><select id="f_type">${typeOptions}</select></div>
      <div style="grid-column:span 4"><label>기안부서 *</label><select id="f_dept">${deptOptions}</select></div>
      <div style="grid-column:span 12"><label>제목 *</label><input id="f_title" required value="${esc(doc?.title ?? '')}"></div>
      <div style="grid-column:span 8"><label>수신(자)</label><input id="f_recipient" placeholder="예: OO기관 담당자 (기안문은 비워두면 '내부결재'로 표시)" value="${esc(doc?.recipient ?? '')}"></div>
      <div style="grid-column:span 4"><label>공개구분</label><select id="f_disclosure">${disclosureOptions}</select></div>
      <div style="grid-column:span 12"><label>본문 *</label><textarea id="f_body" required rows="10" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(doc?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="docErr"></span>
      </div>
    </form>
    <p class="note">저장 후 상세화면에서 [상신]을 눌러야 결재가 시작됩니다(문서번호는 상신 시점에 채번). 대표이사 1인 체제라 결재선 없이 상신 즉시 본인이 승인/반려를 결정합니다.</p>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => {
    mode = doc ? 'view' : 'list';
    if (!doc) currentDocId = null;
    renderDocuments(container);
  };

  document.getElementById('docForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('docErr');
    errEl.textContent = '';

    const payload = {
      doc_scope: document.getElementById('f_scope').value,
      doc_type: document.getElementById('f_type').value,
      dept_id: Number(document.getElementById('f_dept').value) || null,
      title: document.getElementById('f_title').value.trim(),
      recipient: document.getElementById('f_recipient').value.trim() || null,
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
      <h2 style="margin-bottom:0">${esc(doc.title)}</h2>
      <span class="badge draft" style="margin-left:10px">${esc(SCOPE_LABEL[doc.doc_scope] ?? SCOPE_LABEL.internal)}</span>
      <span class="badge ${STATUS_BADGE[doc.status]}">${STATUS_LABEL[doc.status]}</span>
      <span style="margin-left:auto">${actions.join(' ')}</span>
    </div>
    <table>
      <tr><th style="width:110px">문서번호</th><td>${esc(doc.doc_no ?? '(미상신)')}</td><th style="width:110px">문서구분</th><td>${esc(doc.doc_type)}</td></tr>
      <tr><th>기안부서</th><td>${esc(deptName)}</td><th>기안자</th><td>${esc(doc.drafter_email)}</td></tr>
      <tr><th>수신(자)</th><td>${esc(doc.recipient || (doc.doc_scope === 'external' ? '' : '내부결재'))}</td><th>공개구분</th><td>${esc(doc.disclosure ?? '공개')}</td></tr>
      <tr><th>작성일</th><td>${String(doc.created_at).slice(0, 10)}</td><th>상신일</th><td>${doc.submitted_at ? String(doc.submitted_at).slice(0, 10) : ''}</td></tr>
      ${doc.decided_at ? `<tr><th>결재일</th><td>${String(doc.decided_at).slice(0, 10)}</td><th>결재자</th><td>${esc(doc.decided_by ?? '')}</td></tr>` : ''}
      ${doc.decision_note ? `<tr><th>결재의견</th><td colspan="3">${esc(doc.decision_note)}</td></tr>` : ''}
    </table>
    <div style="white-space:pre-wrap;margin-top:16px;line-height:1.8">${esc(doc.body)}</div>
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { mode = 'list'; currentDocId = null; renderDocuments(container); };

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
