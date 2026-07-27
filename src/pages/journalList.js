import { supabase } from '../lib/supabaseClient.js';
import { fetchFiscalYears } from '../lib/data.js';
import { esc, fmt, todayStr } from '../lib/util.js';

const STATUS_LABEL = { draft: '임시(draft)', posted: '전기(posted)', void: '취소' };
const STATUS_BADGE = { draft: 'draft', posted: 'ok', void: 'bad' };
const SOURCE_LABEL = { manual: '수기', auto: '자동', closing: '마감', opening: '개시' };
const PAGE_SIZE = 30;

let selectedYear = null;
let page = 0;

export async function renderJournalList(container) {
  const years = await fetchFiscalYears();
  if (!selectedYear) selectedYear = years[years.length - 1] ?? Number(todayStr().slice(0, 4));

  const from = `${selectedYear}-01-01`;
  const to = `${selectedYear}-12-31`;

  const { data: entries, count, error } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*, accounts(account_code, account_name))', { count: 'exact' })
    .gte('entry_date', from)
    .lte('entry_date', to)
    .order('entry_date', { ascending: false })
    .order('entry_id', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const yearOptions = years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}년</option>`).join('');
  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  const toolbarHtml = `<div class="card">
    <div class="toolbar">
      <label>회계연도: </label>
      <select id="jlYear">${yearOptions}</select>
      <span class="note">${count ?? 0}건 · ${totalPages}쪽 중 ${page + 1}쪽</span>
      <span style="flex:1"></span>
      <button class="btn sm ghost" id="jlPrev" ${page <= 0 ? 'disabled' : ''}>이전</button>
      <button class="btn sm ghost" id="jlNext" ${page + 1 >= totalPages ? 'disabled' : ''}>다음</button>
    </div>
  </div>`;

  if (error) {
    container.innerHTML = toolbarHtml + `<div class="card"><p class="err">분개장 조회 실패: ${esc(error.message)}</p></div>`;
    wireToolbar();
    return;
  }

  const blocks = entries
    .map((e) => {
      const lines = [...(e.journal_lines ?? [])].sort((a, b) => a.line_id - b.line_id);
      const lineRows = lines
        .map(
          (l) => `<tr>
            <td>${esc(l.accounts?.account_code ?? '')} ${esc(l.accounts?.account_name ?? '')}</td>
            <td class="num">${l.debit_amount ? fmt(l.debit_amount) : ''}</td>
            <td class="num">${l.credit_amount ? fmt(l.credit_amount) : ''}</td>
            <td class="c">${esc(l.segment ?? '')}</td>
          </tr>`
        )
        .join('');
      const totalDr = lines.reduce((s, l) => s + Number(l.debit_amount), 0);
      const totalCr = lines.reduce((s, l) => s + Number(l.credit_amount), 0);

      return `<div class="card">
        <div class="toolbar">
          <strong>${esc(e.entry_date)}</strong>
          <span class="note">${esc(e.entry_no ?? '(번호없음)')} · ${SOURCE_LABEL[e.source_type] ?? e.source_type}</span>
          <span class="badge ${STATUS_BADGE[e.status] ?? ''}">${STATUS_LABEL[e.status] ?? e.status}</span>
          <span style="flex:1" class="desc-view" data-desc-view="${e.entry_id}">${esc(e.description ?? '')}</span>
          <span style="flex:1; display:none" class="desc-edit" data-desc-edit="${e.entry_id}">
            <input type="text" value="${esc(e.description ?? '')}" style="width:100%">
          </span>
          <button class="btn sm ghost" data-desc-start="${e.entry_id}">적요 수정</button>
          <button class="btn sm" data-desc-save="${e.entry_id}" style="display:none">저장</button>
          <button class="btn sm ghost" data-desc-cancel="${e.entry_id}" style="display:none">취소</button>
          ${e.status === 'draft' ? `<button class="btn sm" data-post="${e.entry_id}">전기(승인)</button><button class="btn sm danger" data-del="${e.entry_id}">삭제</button>` : ''}
        </div>
        <div style="overflow-x:auto"><table>
          <tr><th>계정</th><th>차변</th><th>대변</th><th>부문</th></tr>
          ${lineRows}
          <tr class="tot"><td>합계</td><td class="num">${fmt(totalDr)}</td><td class="num">${fmt(totalCr)}</td><td></td></tr>
        </table></div>
      </div>`;
    })
    .join('');

  container.innerHTML = toolbarHtml + (blocks || '<div class="card"><p class="note">해당 연도에 등록된 분개가 없습니다.</p></div>');
  wireToolbar();

  function wireToolbar() {
    document.getElementById('jlYear').addEventListener('change', (ev) => {
      selectedYear = Number(ev.target.value);
      page = 0;
      renderJournalList(container);
    });
    document.getElementById('jlPrev')?.addEventListener('click', () => {
      if (page > 0) { page -= 1; renderJournalList(container); }
    });
    document.getElementById('jlNext')?.addEventListener('click', () => {
      if (page + 1 < totalPages) { page += 1; renderJournalList(container); }
    });
  }

  container.querySelectorAll('[data-post]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.post);
      b.disabled = true;
      const { error: postErr } = await supabase
        .from('journal_entries')
        .update({ status: 'posted', posted_at: new Date().toISOString() })
        .eq('entry_id', id);
      if (postErr) {
        alert('전기 실패: ' + postErr.message);
        b.disabled = false;
        return;
      }
      renderJournalList(container);
    };
  });

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.del);
      if (!confirm('이 임시 분개를 삭제할까요?')) return;
      const { error: delErr } = await supabase.from('journal_entries').delete().eq('entry_id', id);
      if (delErr) {
        alert('삭제 실패: ' + delErr.message);
        return;
      }
      renderJournalList(container);
    };
  });

  function setDescEditMode(id, editing) {
    const toolbar = container.querySelector(`[data-desc-start="${id}"]`).parentElement;
    toolbar.querySelector(`[data-desc-view="${id}"]`).style.display = editing ? 'none' : '';
    toolbar.querySelector(`[data-desc-edit="${id}"]`).style.display = editing ? '' : 'none';
    toolbar.querySelector(`[data-desc-start="${id}"]`).style.display = editing ? 'none' : '';
    toolbar.querySelector(`[data-desc-save="${id}"]`).style.display = editing ? '' : 'none';
    toolbar.querySelector(`[data-desc-cancel="${id}"]`).style.display = editing ? '' : 'none';
  }

  container.querySelectorAll('[data-desc-start]').forEach((b) => {
    b.onclick = () => setDescEditMode(Number(b.dataset.descStart), true);
  });

  container.querySelectorAll('[data-desc-cancel]').forEach((b) => {
    b.onclick = () => setDescEditMode(Number(b.dataset.descCancel), false);
  });

  container.querySelectorAll('[data-desc-save]').forEach((b) => {
    b.onclick = async () => {
      const id = Number(b.dataset.descSave);
      const input = container.querySelector(`[data-desc-edit="${id}"] input`);
      const newDesc = input.value.trim() || null;
      b.disabled = true;
      const { error: updErr } = await supabase
        .from('journal_entries')
        .update({ description: newDesc })
        .eq('entry_id', id);
      b.disabled = false;
      if (updErr) {
        alert('적요 수정 실패: ' + updErr.message);
        return;
      }
      renderJournalList(container);
    };
  });
}
