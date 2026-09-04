import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';
import { DOC_TYPES, EVIDENCE_TYPES, TAX_TREATMENTS, requiresIssuer } from '../lib/letterhead.js';
import { renderLetterheadBody, openLetterheadPrint } from '../lib/letterheadPrint.js';
import { renderExpenseResolutionBody, openExpensePrint } from '../lib/expenseResolution.js';
import { exportDocumentToDocx, exportExpenseResolutionToDocx } from '../lib/exportDocx.js';
import { fetchExpenseAccounts, accountLabel as expenseAccountLabel } from '../lib/expenseAccounts.js';
import { retentionDeadline } from '../lib/retention.js';

const EXPENSE_TYPE = '지급회의서';

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

function officialFieldsBlock(doc) {
  return `<div class="grid" id="officialWrap" style="grid-template-columns:1fr 1fr;grid-column:span 12;margin:0 0 4px">
    <div><label>수신(자)</label><input id="f_recipient" type="text" placeholder="예: OO기관 담당자 (기안문은 비워두면 '내부결재'로 표시)" value="${esc(doc?.recipient ?? '')}"></div>
    <div><label>발송명의인 <span id="issuerReq" class="note"></span></label><input id="f_issuer" type="text" placeholder="예: 대표이사 홍길동" value="${esc(doc?.issuer_name ?? '')}"></div>
  </div>`;
}

function expenseFieldsBlock(doc, accounts) {
  const accountOptions = ['<option value="">(선택)</option>', ...accounts.map((a) => `<option value="${a.account_id}" ${doc?.account_id === a.account_id ? 'selected' : ''}>${esc(a.account_code)} ${esc(a.account_name)}</option>`)].join('');
  const evidenceOptions = ['<option value="">(선택)</option>', ...EVIDENCE_TYPES.map((t) => `<option value="${t}" ${doc?.evidence_type === t ? 'selected' : ''}>${t}</option>`)].join('');
  const taxOptions = ['<option value="">(선택)</option>', ...TAX_TREATMENTS.map((t) => `<option value="${t}" ${doc?.tax_treatment === t ? 'selected' : ''}>${t}</option>`)].join('');

  return `<div class="grid" id="expenseWrap" style="grid-template-columns:repeat(4,1fr);grid-column:span 12;margin:0 0 4px">
    <div><label>계정과목 *</label><select id="f_account">${accountOptions}</select></div>
    <div><label>지출금액 *</label><input id="f_amount" type="number" min="0" step="1" value="${doc?.expense_amount ?? ''}"></div>
    <div><label>지출처</label><input id="f_payee" type="text" value="${esc(doc?.payee ?? '')}"></div>
    <div><label>증빙유형</label><select id="f_evidence">${evidenceOptions}</select></div>
    <div style="grid-column:span 4"><label>세무처리</label><select id="f_tax">${taxOptions}</select></div>
  </div>
  <p class="note" style="grid-column:span 12">계정과목은 회계 시스템의 계정과목 목록을 그대로 씁니다. 증빙서류(세금계산서 등)는 저장 후 상세화면에서 첨부파일로 올려주세요.</p>`;
}

async function renderForm(container) {
  const [departments, accounts] = await Promise.all([fetchDepartments({ activeOnly: true }), fetchExpenseAccounts()]);
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
      ${officialFieldsBlock(doc)}
      ${expenseFieldsBlock(doc, accounts)}
      <div style="grid-column:span 12"><label>본문 *</label><textarea id="f_body" required rows="10" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(doc?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="docErr"></span>
      </div>
    </form>
    <p class="note">문서 하단에 발송명의인이 있으면 <b>시행문</b>, 없으면 <b>기안문</b>입니다. 지급회의서는 비용 지출 승인 전용이라 수신/발송명의인 대신 계정과목·금액을 입력합니다. 저장 후 상세화면에서 [상신]을 눌러야 결재가 시작됩니다(문서번호는 상신 시점에 채번). 대표이사 1인 체제라 결재선 없이 상신 즉시 본인이 승인/반려를 결정합니다.</p>
  </div>`;

  const typeSel = document.getElementById('f_type');
  const officialWrap = document.getElementById('officialWrap');
  const expenseWrap = document.getElementById('expenseWrap');
  const syncFieldVisibility = () => {
    const isExpense = typeSel.value === EXPENSE_TYPE;
    // .grid 클래스가 display:grid를 강제해서(author 스타일이 UA의 [hidden] 규칙보다 우선순위가
    // 높음) hidden 속성만으로는 안 숨겨진다 — 인라인 style.display로 직접 토글한다.
    officialWrap.style.display = isExpense ? 'none' : 'grid';
    expenseWrap.style.display = isExpense ? 'grid' : 'none';
    document.getElementById('f_account').required = isExpense;
    document.getElementById('f_amount').required = isExpense;
    const need = requiresIssuer(typeSel.value);
    document.getElementById('f_issuer').required = need;
    document.getElementById('issuerReq').textContent = need ? '(시행문은 필수)' : '(선택)';
  };
  typeSel.onchange = syncFieldVisibility;
  syncFieldVisibility();

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
    const isExpense = docType === EXPENSE_TYPE;
    const issuerName = document.getElementById('f_issuer').value.trim() || null;
    if (requiresIssuer(docType) && !issuerName) {
      errEl.textContent = '시행문은 발송명의인을 입력해야 합니다.';
      return;
    }
    const accountId = Number(document.getElementById('f_account').value) || null;
    const amount = document.getElementById('f_amount').value;
    if (isExpense && (!accountId || amount === '')) {
      errEl.textContent = '지급회의서는 계정과목과 지출금액을 입력해야 합니다.';
      return;
    }

    const payload = {
      doc_type: docType,
      dept_id: Number(document.getElementById('f_dept').value) || null,
      title: document.getElementById('f_title').value.trim(),
      disclosure: document.getElementById('f_disclosure').value,
      body: document.getElementById('f_body').value,
      // 기안문/시행문 필드와 지급회의서 필드는 서로 배타적 — 문서종류를 바꾸면 안 쓰는 쪽은 비운다.
      recipient: isExpense ? null : document.getElementById('f_recipient').value.trim() || null,
      issuer_name: isExpense ? null : issuerName,
      account_id: isExpense ? accountId : null,
      expense_amount: isExpense && amount !== '' ? Number(amount) : null,
      payee: isExpense ? document.getElementById('f_payee').value.trim() || null : null,
      evidence_type: isExpense ? document.getElementById('f_evidence').value || null : null,
      tax_treatment: isExpense ? document.getElementById('f_tax').value || null : null,
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
  const isExpense = doc.doc_type === EXPENSE_TYPE;
  const accounts = isExpense ? await fetchExpenseAccounts() : [];
  const acctLabel = isExpense ? expenseAccountLabel(accounts, doc.account_id) : '';

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
      <span class="note" style="margin-left:8px">${esc(doc.doc_no ?? '(미상신)')} · ${esc(deptName)} · 기안 ${esc(doc.drafter_email)} · 보존기한 ${esc(retentionDeadline(doc.created_at))}</span>
      <span style="margin-left:auto">${actions.join(' ')}</span>
    </div>
    ${doc.decision_note ? `<p class="note"><b>결재의견</b> — ${esc(doc.decision_note)} (${esc(doc.decided_by ?? '')}, ${doc.decided_at ? String(doc.decided_at).slice(0, 10) : ''})</p>` : ''}
  </div>
  <div class="card" style="font-family:'Batang','바탕','Malgun Gothic',serif;max-width:800px;margin-left:auto;margin-right:auto">
    ${isExpense ? renderExpenseResolutionBody(doc, deptName, acctLabel) : renderLetterheadBody(doc, deptName)}
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderDocuments(container); };

  const editBtn = document.getElementById('editBtn');
  if (editBtn) editBtn.onclick = () => { mode = 'edit'; renderDocuments(container); };

  const printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.onclick = () => (isExpense ? openExpensePrint(doc, deptName, acctLabel) : openLetterheadPrint(doc, deptName));

  const docxBtn = document.getElementById('docxBtn');
  if (docxBtn) {
    docxBtn.onclick = async () => {
      docxBtn.disabled = true;
      try {
        if (isExpense) await exportExpenseResolutionToDocx(doc, deptName, acctLabel);
        else await exportDocumentToDocx(doc, deptName);
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
