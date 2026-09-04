import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { DOC_TYPES } from '../lib/letterhead.js';

function dateStr(ts) {
  return ts ? String(ts).slice(0, 10) : '';
}

// 아리오피스 홈 화면의 "이달의 문서 현황"(기안/시행 등 구성비 막대)을 참고해, 이번 달 문서를
// 종류별로 몇 건씩 상신했는지 막대로 보여준다(파이/도넛 라이브러리 없이 기존 대시보드 스타일 재사용).
function typeBreakdown(docs) {
  const monthStart = new Date();
  monthStart.setDate(1);
  const thisMonth = docs.filter((d) => new Date(d.created_at) >= monthStart);
  const total = thisMonth.length || 1;
  return DOC_TYPES.map((t) => {
    const count = thisMonth.filter((d) => d.doc_type === t).length;
    return { type: t, count, pct: Math.round((count / total) * 100) };
  });
}

export async function renderDashboard(container) {
  const [{ count: pendingCount }, { count: regCount }, { data: allDocs }, { data: recentRegs }, { data: recentPosts }] =
    await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('regulations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('documents').select('doc_id,doc_no,title,doc_type,status,created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('regulations').select('reg_id,title,category,effective_date').eq('status', 'active').order('updated_at', { ascending: false }).limit(5),
      supabase.from('dept_posts').select('post_id,title,dept_id,created_at').order('created_at', { ascending: false }).limit(5),
    ]);

  const STATUS_LABEL = { draft: '기안중', submitted: '결재대기', approved: '승인', rejected: '반려' };
  const STATUS_BADGE = { draft: 'draft', submitted: 'draft', approved: 'ok', rejected: 'bad' };

  const docs = allDocs ?? [];
  const draftDocs = docs.filter((d) => d.doc_type === '기안문' || d.doc_type === '지급회의서').slice(0, 5);
  const implDocs = docs.filter((d) => d.doc_type === '시행문').slice(0, 5);

  const docListRows = (list) =>
    list.length
      ? `<table><tr><th>문서번호</th><th>제목</th><th>상태</th><th>작성일</th></tr>${list
          .map(
            (d) => `<tr>
              <td>${esc(d.doc_no ?? '(미상신)')}</td>
              <td>${esc(d.title)}</td>
              <td class="c"><span class="badge ${STATUS_BADGE[d.status]}">${STATUS_LABEL[d.status]}</span></td>
              <td class="c">${dateStr(d.created_at)}</td>
            </tr>`
          )
          .join('')}</table>`
      : '<p class="note">문서가 없습니다.</p>';

  const breakdown = typeBreakdown(docs);
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));
  const bars = breakdown
    .map(
      (b) => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:70px;font-size:12px;color:var(--text-sub)">${esc(b.type)}</div>
        <div style="flex:1;background:var(--bg);border-radius:6px;overflow:hidden;height:16px">
          <div style="width:${Math.round((b.count / maxCount) * 100)}%;background:var(--brand);height:100%"></div>
        </div>
        <div style="width:70px;font-size:12px;color:var(--text-mute);text-align:right">${b.count}건 (${b.pct}%)</div>
      </div>`
    )
    .join('');

  const regRows = (recentRegs ?? [])
    .map(
      (r) => `<tr>
        <td class="c">${esc(r.category)}</td>
        <td>${esc(r.title)}</td>
        <td class="c">${dateStr(r.effective_date)}</td>
      </tr>`
    )
    .join('');

  const postRows = (recentPosts ?? [])
    .map(
      (p) => `<tr>
        <td>${esc(p.title)}</td>
        <td class="c">${dateStr(p.created_at)}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="grid">
    <div class="kpi"><div class="t">결재 대기 문서</div><div class="v">${pendingCount ?? 0}</div></div>
    <div class="kpi"><div class="t">시행중 규정</div><div class="v">${regCount ?? 0}</div></div>
  </div>

  <div class="card">
    <h2>이달의 문서 현황</h2>
    ${bars}
  </div>

  <div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card">
      <h2>기안문서</h2>
      <div style="overflow-x:auto">${docListRows(draftDocs)}</div>
    </div>
    <div class="card">
      <h2>시행문서</h2>
      <div style="overflow-x:auto">${docListRows(implDocs)}</div>
    </div>
  </div>

  <div class="card">
    <h2>최근 제규정</h2>
    ${regRows ? `<div style="overflow-x:auto"><table><tr><th>구분</th><th>제목</th><th>시행일</th></tr>${regRows}</table></div>` : '<p class="note">등록된 규정이 없습니다.</p>'}
  </div>

  <div class="card">
    <h2>최근 부서 업무자료</h2>
    ${postRows ? `<div style="overflow-x:auto"><table><tr><th>제목</th><th>등록일</th></tr>${postRows}</table></div>` : '<p class="note">등록된 게시글이 없습니다.</p>'}
  </div>`;
}
