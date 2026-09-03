import { supabase } from './supabaseClient.js';
import { esc } from './util.js';

const BUCKET = 'portal-files';

export async function listAttachments(targetType, targetId) {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function uploadAttachment(targetType, targetId, file, uploaderEmail) {
  const path = `${targetType}/${targetId}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from('attachments').insert({
    target_type: targetType,
    target_id: targetId,
    file_name: file.name,
    storage_path: path,
    file_size: file.size,
    uploaded_by: uploaderEmail ?? null,
  });
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insErr;
  }
}

export async function deleteAttachment(attachment) {
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
  const { error } = await supabase.from('attachments').delete().eq('attachment_id', attachment.attachment_id);
  if (error) throw error;
}

// 비공개 버킷이라 다운로드는 매번 서명 URL을 발급받아 처리한다(1시간 유효).
// win은 클릭 핸들러에서 동기적으로 window.open('','_blank')로 미리 열어 넘겨받은 빈 탭 —
// createSignedUrl의 await 이후에 window.open을 호출하면 사용자 제스처 컨텍스트를 벗어나
// 브라우저 팝업 차단에 걸리기 때문에, 탭은 미리 열고 URL만 나중에 채워 넣는다.
export async function downloadAttachment(attachment, win) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.storage_path, 3600);
  if (error) {
    win?.close();
    throw error;
  }
  if (win) win.location.href = data.signedUrl;
  else window.open(data.signedUrl, '_blank');
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// 문서/규정/부서게시글 상세 화면에서 공통으로 쓰는 첨부파일 목록+업로드 위젯.
// container 안에 자체적으로 렌더링·이벤트 바인딩까지 마치고, 변경 시 스스로 다시 그린다.
export async function renderAttachmentsWidget(container, targetType, targetId, userEmail) {
  const list = await listAttachments(targetType, targetId);

  container.innerHTML = `
    <h3>첨부파일</h3>
    ${list.length === 0 ? '<p class="note">첨부된 파일이 없습니다.</p>' : `<table>
      <tr><th>파일명</th><th>크기</th><th>업로드</th><th></th></tr>
      ${list
        .map(
          (a) => `<tr>
            <td><a href="#" data-dl="${a.attachment_id}">${esc(a.file_name)}</a></td>
            <td class="c">${fmtSize(a.file_size)}</td>
            <td class="c">${esc(a.uploaded_by ?? '')}</td>
            <td class="c"><button class="btn sm ghost" data-del="${a.attachment_id}">삭제</button></td>
          </tr>`
        )
        .join('')}
    </table>`}
    <div class="toolbar" style="margin-top:10px">
      <input type="file" id="attFile">
      <button class="btn sm" id="attUploadBtn">업로드</button>
      <span class="err" id="attErr"></span>
    </div>`;

  const byId = (id) => list.find((a) => a.attachment_id === Number(id));
  const refresh = () => renderAttachmentsWidget(container, targetType, targetId, userEmail);

  container.querySelectorAll('[data-dl]').forEach((a) => {
    a.onclick = (ev) => {
      ev.preventDefault();
      const win = window.open('', '_blank');
      downloadAttachment(byId(a.dataset.dl), win).catch((err) => alert('다운로드 실패: ' + err.message));
    };
  });

  container.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('첨부파일을 삭제할까요?')) return;
      try {
        await deleteAttachment(byId(b.dataset.del));
        refresh();
      } catch (err) {
        alert('삭제 실패: ' + err.message);
      }
    };
  });

  document.getElementById('attUploadBtn').onclick = async () => {
    const input = document.getElementById('attFile');
    const errEl = document.getElementById('attErr');
    errEl.textContent = '';
    if (!input.files[0]) return;
    try {
      await uploadAttachment(targetType, targetId, input.files[0], userEmail);
      refresh();
    } catch (err) {
      errEl.textContent = '업로드 실패: ' + err.message;
    }
  };
}
