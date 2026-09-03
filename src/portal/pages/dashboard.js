import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';

function dateStr(ts) {
  return ts ? String(ts).slice(0, 10) : '';
}

export async function renderDashboard(container) {
  const [{ count: pendingCount }, { count: regCount }, { data: recentDocs }, { data: recentRegs }, { data: recentPosts }] =
    await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('regulations').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('documents').select('doc_id,doc_no,title,status,created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('regulations').select('reg_id,title,category,effective_date').eq('status', 'active').order('updated_at', { ascending: false }).limit(5),
      supabase.from('dept_posts').select('post_id,title,dept_id,created_at').order('created_at', { ascending: false }).limit(5),
    ]);

  const STATUS_LABEL = { draft: '기안중', submitted: '결재대기', approved: '승인', rejected: '반려' };
  const STATUS_BADGE = { draft: 'draft', submitted: 'draft', approved: 'ok', rejected: 'bad' };

  const docRows = (recentDocs ?? [])
    .map(
      (d) => `<tr>
        <td>${esc(d.doc_no ?? '(미상신)')}</td>
        <td>${esc(d.title)}</td>
        <td class="c"><span class="badge ${STATUS_BADGE[d.status]}">${STATUS_LABEL[d.status]}</span></td>
        <td class="c">${dateStr(d.created_at)}</td>
      </tr>`
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
    <h2>최근 결재문서</h2>
    ${docRows ? `<div style="overflow-x:auto"><table><tr><th>문서번호</th><th>제목</th><th>상태</th><th>작성일</th></tr>${docRows}</table></div>` : '<p class="note">등록된 문서가 없습니다.</p>'}
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
