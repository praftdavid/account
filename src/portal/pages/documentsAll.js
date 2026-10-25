import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { openDocument } from './documents.js';
import { openRegulation } from './regulations.js';
import { navigate } from '../nav.js';

const DOC_STATUS = { draft: ['기안중', 'draft'], submitted: ['결재대기', 'draft'], approved: ['승인', 'ok'], rejected: ['반려', 'bad'], recalled: ['회수됨', 'bad'] };
const REG_STATUS = { active: ['시행중', 'ok'], abolished: ['폐지', 'bad'] };

let kind = 'all'; // 'all' | 'doc' | 'reg'
let query = '';
let searchTimer = null;

// "문서 > 전체": 결재 문서(기안문·시행문)와 규정·정관을 한 목록에서 날짜순으로 보여준다. 누르면 각자의 상세 화면으로 간다.
export async function renderAllDocuments(container) {
  const [{ data: docs, error: docErr }, { data: regs, error: regErr }] = await Promise.all([
    supabase.from('documents').select('doc_id,doc_type,title,doc_no,status,created_at').order('created_at', { ascending: false }).limit(300),
    supabase.from('regulations').select('reg_id,category,title,reg_no,version,status,effective_date,created_at').order('created_at', { ascending: false }).limit(300),
  ]);
  if (docErr || regErr) {
    container.innerHTML = `<div class="card"><p class="err">목록 조회 실패: ${esc((docErr ?? regErr).message)}</p></div>`;
    return;
  }

  const items = [
    ...(docs ?? []).map((d) => ({
      type: 'doc',
      id: d.doc_id,
      tag: d.doc_type,
      title: d.title,
      meta: d.doc_no ?? '미상신',
      date: String(d.created_at).slice(0, 10),
      status: DOC_STATUS[d.status] ?? [d.status, 'draft'],
    })),
    ...(regs ?? []).map((r) => ({
      type: 'reg',
      id: r.reg_id,
      tag: r.category,
      title: r.title,
      meta: [r.reg_no, r.version && `v${r.version}`].filter(Boolean).join(' · ') || '규정',
      date: String(r.effective_date ?? r.created_at).slice(0, 10),
      status: REG_STATUS[r.status] ?? [r.status, 'draft'],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (kind === 'all' || i.type === kind) && (!q || `${i.title} ${i.meta} ${i.tag}`.toLowerCase().includes(q)));

  const chips = [['all', '전체'], ['doc', '기안·결재'], ['reg', '규정·정관']]
    .map(([k, label]) => `<button class="btn sm ${k === kind ? '' : 'ghost'}" data-kind="${k}">${label}</button>`)
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      ${chips}
      <input id="allQuery" type="search" placeholder="제목·번호 검색" value="${esc(query)}" style="margin-left:8px;flex:1;min-width:140px">
    </div>
    ${
      shown
        .map(
          (i, n) => `<button class="home-row" data-i="${n}">
        <span class="badge draft">${esc(i.tag)}</span>
        <span class="home-row-main"><b>${esc(i.title)}</b><span class="note">${esc(i.meta)} · ${i.date}</span></span>
        <span class="badge ${i.status[1]}">${esc(i.status[0])}</span>
      </button>`
        )
        .join('') || '<p class="note">표시할 문서가 없습니다.</p>'
    }
  </div>`;

  container.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { kind = b.dataset.kind; renderAllDocuments(container); }));
  const input = document.getElementById('allQuery');
  input.oninput = () => {
    query = input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      await renderAllDocuments(container);
      const el = document.getElementById('allQuery');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 250);
  };
  container.querySelectorAll('[data-i]').forEach((b) => {
    b.onclick = () => {
      const i = shown[Number(b.dataset.i)];
      if (i.type === 'doc') { openDocument(i.id); navigate('docs'); }
      else { openRegulation(i.id); navigate('regs'); }
    };
  });
}
