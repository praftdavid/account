import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { renderAttachmentsWidget } from '../../lib/attachments.js';
import { fetchDepartments } from '../lib/departments.js';

let mode = 'list'; // 'list' | 'new' | 'edit' | 'view'
let currentPostId = null;
let selectedDeptId = null;
let yearFilter = 'all';

export function resetView() {
  mode = 'list';
  currentPostId = null;
}

function yearOf(dateStr) {
  return dateStr ? Number(String(dateStr).slice(0, 4)) : null;
}

async function currentUserEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

export async function renderDeptPosts(container) {
  const departments = await fetchDepartments({ activeOnly: true });
  if (departments.length === 0) {
    container.innerHTML = '<div class="card"><p class="note">등록된 부서가 없습니다. [기초정보 &gt; 부서관리]에서 먼저 부서를 추가하세요.</p></div>';
    return;
  }
  if (selectedDeptId == null || !departments.some((d) => d.dept_id === selectedDeptId)) {
    selectedDeptId = departments[0].dept_id;
  }

  if (mode === 'list') return renderList(container, departments);
  if (mode === 'new' || mode === 'edit') return renderForm(container, departments);
  return renderDetail(container, departments);
}

async function renderList(container, departments) {
  const { data: allPosts, error } = await supabase
    .from('dept_posts')
    .select('*')
    .eq('dept_id', selectedDeptId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">게시글 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }

  const years = [...new Set(allPosts.map((p) => yearOf(p.created_at)))].sort((a, b) => b - a);
  if (!years.includes(new Date().getFullYear())) years.unshift(new Date().getFullYear());
  const posts = allPosts.filter((p) => yearFilter === 'all' || yearOf(p.created_at) === Number(yearFilter));

  const deptOptions = departments.map((d) => `<option value="${d.dept_id}" ${d.dept_id === selectedDeptId ? 'selected' : ''}>${esc(d.dept_name)}</option>`).join('');
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${String(y) === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = posts
    .map(
      (p) => `<tr>
        <td>${p.pinned ? '📌 ' : ''}<a href="#" data-open="${p.post_id}">${esc(p.title)}</a></td>
        <td class="c">${esc(p.author_email ?? '')}</td>
        <td class="c">${String(p.created_at).slice(0, 10)}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <label style="margin-right:4px">부서</label>
      <select id="deptSel">${deptOptions}</select>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn" id="newPostBtn" style="margin-left:auto">새 글 작성</button>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>제목</th><th>작성자</th><th>작성일</th></tr>
      ${rows || '<tr><td colspan="3" class="note" style="text-align:center">등록된 게시글이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('deptSel').onchange = (ev) => {
    selectedDeptId = Number(ev.target.value);
    renderDeptPosts(container);
  };
  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderDeptPosts(container); };
  container.querySelectorAll('[data-open]').forEach((a) => {
    a.onclick = (ev) => { ev.preventDefault(); currentPostId = Number(a.dataset.open); mode = 'view'; renderDeptPosts(container); };
  });
  document.getElementById('newPostBtn').onclick = () => { currentPostId = null; mode = 'new'; renderDeptPosts(container); };
}

async function renderForm(container, departments) {
  let post = null;
  if (mode === 'edit' && currentPostId) {
    const { data, error } = await supabase.from('dept_posts').select('*').eq('post_id', currentPostId).single();
    if (error) {
      container.innerHTML = `<div class="card"><p class="err">게시글 조회 실패: ${esc(error.message)}</p></div>`;
      return;
    }
    post = data;
  }

  const deptId = post?.dept_id ?? selectedDeptId;
  const deptOptions = departments.map((d) => `<option value="${d.dept_id}" ${d.dept_id === deptId ? 'selected' : ''}>${esc(d.dept_name)}</option>`).join('');

  container.innerHTML = `
  <div class="card">
    <h2>${post ? '게시글 수정' : '새 글 작성'}</h2>
    <form class="entry" id="postForm">
      <div style="grid-column:span 4"><label>부서 *</label><select id="f_dept">${deptOptions}</select></div>
      <div style="grid-column:span 6"><label>제목 *</label><input id="f_title" type="text" required value="${esc(post?.title ?? '')}"></div>
      <div style="grid-column:span 2"><label>&nbsp;</label><label style="display:flex;align-items:center;height:36px;gap:6px"><input type="checkbox" id="f_pinned" ${post?.pinned ? 'checked' : ''}> 상단 고정</label></div>
      <div style="grid-column:span 12"><label>내용</label><textarea id="f_body" rows="10" style="width:100%;padding:10px 12px;border:1px solid transparent;background:var(--bg);border-radius:var(--radius-sm);font-family:inherit;font-size:13px;resize:vertical">${esc(post?.body ?? '')}</textarea></div>
      <div style="grid-column:span 12" class="toolbar">
        <button class="btn" type="submit">저장</button>
        <button class="btn ghost" type="button" id="cancelBtn">취소</button>
        <span class="err" id="postErr"></span>
      </div>
    </form>
  </div>`;

  document.getElementById('cancelBtn').onclick = () => {
    mode = post ? 'view' : 'list';
    if (!post) currentPostId = null;
    renderDeptPosts(container);
  };

  document.getElementById('postForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errEl = document.getElementById('postErr');
    errEl.textContent = '';

    const payload = {
      dept_id: Number(document.getElementById('f_dept').value),
      title: document.getElementById('f_title').value.trim(),
      body: document.getElementById('f_body').value,
      pinned: document.getElementById('f_pinned').checked,
      updated_at: new Date().toISOString(),
    };
    selectedDeptId = payload.dept_id;

    if (post) {
      const { error } = await supabase.from('dept_posts').update(payload).eq('post_id', post.post_id);
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentPostId = post.post_id;
    } else {
      const email = await currentUserEmail();
      const { data, error } = await supabase.from('dept_posts').insert({ ...payload, author_email: email }).select().single();
      if (error) { errEl.textContent = '저장 실패: ' + error.message; return; }
      currentPostId = data.post_id;
    }
    mode = 'view';
    renderDeptPosts(container);
  });
}

async function renderDetail(container, departments) {
  const { data: post, error } = await supabase.from('dept_posts').select('*').eq('post_id', currentPostId).single();
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">게시글 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }
  const dept = departments.find((d) => d.dept_id === post.dept_id);

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">${post.pinned ? '📌 ' : ''}${esc(post.title)}</h2>
      <span style="margin-left:auto">
        <button class="btn ghost" id="editBtn">수정</button>
        <button class="btn danger" id="delBtn">삭제</button>
        <button class="btn ghost" id="backBtn">목록</button>
      </span>
    </div>
    <p class="note">${esc(dept?.dept_name ?? '')} · ${esc(post.author_email ?? '')} · ${String(post.created_at).slice(0, 10)}</p>
    <div style="white-space:pre-wrap;margin-top:16px;line-height:1.8">${esc(post.body ?? '')}</div>
  </div>
  <div class="card" id="attWrap"></div>`;

  document.getElementById('backBtn').onclick = () => { resetView(); renderDeptPosts(container); };
  document.getElementById('editBtn').onclick = () => { mode = 'edit'; renderDeptPosts(container); };
  document.getElementById('delBtn').onclick = async () => {
    if (!confirm('게시글을 삭제할까요?')) return;
    const { error: delErr } = await supabase.from('dept_posts').delete().eq('post_id', post.post_id);
    if (delErr) { alert('삭제 실패: ' + delErr.message); return; }
    resetView();
    renderDeptPosts(container);
  };

  const email = await currentUserEmail();
  renderAttachmentsWidget(document.getElementById('attWrap'), 'dept_post', post.post_id, email);
}
