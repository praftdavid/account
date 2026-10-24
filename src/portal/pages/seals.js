import { supabase } from '../../lib/supabaseClient.js';
import { esc } from '../../lib/util.js';
import { fetchSeals, loadSealImage, uploadSeal } from '../lib/seal.js';

// 직인관리: 법인 직인 이미지를 등록하고 "사용 중" 직인을 하나 지정한다. 문서에 날인할 때는
// 사용 중 직인이 쓰인다. 이미 날인에 쓰인 직인은 날인기록부와 문서가 참조하므로 삭제하지 못하게
// 막고(사용 중지만 가능), 한 번도 안 쓴 직인만 지울 수 있다.
export async function renderSeals(container) {
  const seals = await fetchSeals();
  const { data: usedRows } = await supabase.from('seal_logs').select('seal_id');
  const used = new Set((usedRows ?? []).map((r) => r.seal_id));
  const images = await Promise.all(seals.map((s) => loadSealImage(s).then((i) => i.dataUrl).catch(() => null)));

  const rows = seals
    .map(
      (s, i) => `<tr>
        <td class="c">${images[i] ? `<img src="${images[i]}" alt="" style="width:48px;height:48px;object-fit:contain;background:#fff;border:1px solid var(--bd);border-radius:6px">` : ''}</td>
        <td>${esc(s.name)}</td>
        <td class="c">${s.is_active ? '<span class="badge ok">사용 중</span>' : ''}</td>
        <td class="c">${String(s.created_at).slice(0, 10)}</td>
        <td class="c">
          ${s.is_active ? '' : `<button class="btn sm ghost" data-use="${s.seal_id}">사용 지정</button>`}
          ${used.has(s.seal_id) ? '' : `<button class="btn sm ghost" data-del="${s.seal_id}">삭제</button>`}
        </td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <h2>직인 관리</h2>
    <p class="note" style="margin:0 0 10px">직인 이미지(PNG/JPG)를 올리면 흰 배경은 자동으로 투명 처리됩니다. 승인된 시행문 상세화면의 [직인 날인]에서 사용 중인 직인이 문서의 "(인)" 자리에 찍히고, PDF에도 반영되며 날인기록부에 남습니다.</p>
    <div class="toolbar">
      <input id="sealName" type="text" placeholder="직인 이름 (예: 대표이사 직인)" style="min-width:220px">
      <input id="sealFile" type="file" accept="image/*">
      <span class="err" id="sealErr"></span>
    </div>
    <div style="overflow-x:auto"><table>
      <tr><th>이미지</th><th>이름</th><th>상태</th><th>등록일</th><th></th></tr>
      ${rows || '<tr><td colspan="5" class="note" style="text-align:center">등록된 직인이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  const errEl = document.getElementById('sealErr');
  document.getElementById('sealFile').onchange = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const name = document.getElementById('sealName').value.trim();
    if (!name) { errEl.textContent = '직인 이름을 먼저 입력하세요.'; ev.target.value = ''; return; }
    errEl.style.color = 'var(--text-mute)';
    errEl.textContent = '업로드 중…';
    try {
      const { data: userData } = await supabase.auth.getUser();
      await uploadSeal(name, file, userData?.user?.email ?? null);
      renderSeals(container);
    } catch (err) {
      errEl.style.color = '';
      errEl.textContent = '업로드 실패: ' + err.message;
    }
  };

  container.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = async () => {
      // 사용 중은 항상 하나 — 먼저 전부 내리고 선택한 것만 올린다.
      const { error: offErr } = await supabase.from('seals').update({ is_active: false }).eq('is_active', true);
      if (offErr) { alert('처리 실패: ' + offErr.message); return; }
      const { error } = await supabase.from('seals').update({ is_active: true }).eq('seal_id', Number(b.dataset.use));
      if (error) { alert('처리 실패: ' + error.message); return; }
      renderSeals(container);
    };
  });
  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 직인을 삭제할까요?')) return;
      const seal = seals.find((s) => s.seal_id === Number(b.dataset.del));
      const { error } = await supabase.from('seals').delete().eq('seal_id', seal.seal_id);
      if (error) { alert('삭제 실패: ' + error.message); return; }
      await supabase.storage.from('portal-files').remove([seal.storage_path]);
      renderSeals(container);
    };
  });
}

let yearFilter = 'all';

// 날인기록부: 어떤 문서에 누가 언제 어떤 직인을 찍었는지의 기록. 날인 취소가 없으므로
// 이 목록은 늘기만 하고, 문서가 나중에 삭제돼도 번호·제목 문자열이 남는다.
export async function renderSealLog(container) {
  const { data, error } = await supabase.from('seal_logs').select('*').order('sealed_at', { ascending: false });
  if (error) {
    container.innerHTML = `<div class="card"><p class="err">날인기록부 조회 실패: ${esc(error.message)}</p></div>`;
    return;
  }
  const all = data ?? [];
  const years = [...new Set(all.map((l) => String(l.sealed_at).slice(0, 4)))].sort().reverse();
  const logs = all.filter((l) => yearFilter === 'all' || String(l.sealed_at).slice(0, 4) === yearFilter);
  const yearOptions = ['<option value="all">전체 연도</option>', ...years.map((y) => `<option value="${y}" ${y === yearFilter ? 'selected' : ''}>${y}년</option>`)].join('');

  const rows = logs
    .map(
      (l, i) => `<tr>
        <td class="c">${logs.length - i}</td>
        <td class="c">${String(l.sealed_at).slice(0, 16).replace('T', ' ')}</td>
        <td>${esc(l.doc_no ?? '')}</td>
        <td>${esc(l.doc_title ?? '')}</td>
        <td class="c">${esc(l.seal_name ?? '')}</td>
        <td class="c">${esc(l.sealed_by ?? '')}</td>
      </tr>`
    )
    .join('');

  container.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <h2 style="margin-bottom:0">날인기록부</h2>
      <select id="yearSel" style="margin-left:8px">${yearOptions}</select>
      <button class="btn ghost sm" id="logExcelBtn" style="margin-left:auto">엑셀 다운로드</button>
    </div>
    <div style="overflow-x:auto"><table id="sealLogTable">
      <tr><th>번호</th><th>날인일시</th><th>문서번호</th><th>제목</th><th>직인</th><th>날인자</th></tr>
      ${rows || '<tr><td colspan="6" class="note" style="text-align:center">날인 기록이 없습니다.</td></tr>'}
    </table></div>
  </div>`;

  document.getElementById('yearSel').onchange = (ev) => { yearFilter = ev.target.value; renderSealLog(container); };
  document.getElementById('logExcelBtn').onclick = async () => {
    const { exportTableToExcel } = await import('../../lib/exportExcel.js');
    exportTableToExcel(document.getElementById('sealLogTable'), '날인기록부.xlsx');
  };
}
