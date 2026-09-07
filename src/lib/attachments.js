import { supabase } from './supabaseClient.js';
import { esc } from './util.js';

const BUCKET = 'portal-files';

// 사진(카메라로 찍은 증빙 등)은 용량이 커서 업로드 전에 줄인다. PDF·워드·HWPX는 이미 압축된
// 포맷이라 재압축해도 실익이 거의 없고, 오히려 열람 방식이 꼬일 수 있어 손대지 않는다.
const COMPRESSIBLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const COMPRESS_THRESHOLD_BYTES = 300 * 1024;

async function compressImageIfNeeded(file) {
  if (!COMPRESSIBLE_TYPES.has(file.type) || file.size < COMPRESS_THRESHOLD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // 압축이 오히려 커지면 원본 유지
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    return file; // 압축 실패 시 원본 그대로 업로드(안전 우선)
  }
}

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

// Supabase Storage는 오브젝트 키에 한글 등 비-ASCII 문자가 들어가면 "Invalid key" 오류를 낸다.
// 그래서 저장 경로에는 원본 파일명을 절대 쓰지 않고 타임스탬프+확장자만 쓰며(확장자는 거의
// 항상 영문이라 안전), 사람이 보는 원본 파일명(한글 포함)은 DB의 file_name 컬럼에만 저장해
// 다운로드 시 downloadAttachment()가 signed URL의 download 옵션으로 되살린다.
export async function uploadAttachment(targetType, targetId, rawFile, uploaderEmail) {
  const file = await compressImageIfNeeded(rawFile);
  const ext = /\.[^./\\]+$/.exec(file.name)?.[0] ?? '';
  const path = `${targetType}/${targetId}/${Date.now()}_${crypto.randomUUID()}${ext}`;
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

// 비공개 버킷이라 다운로드는 매번 서명 URL을 발급받아 처리한다(1시간 유효). 저장 경로 자체는
// 한글이 없는 UUID라서, signed URL의 download 옵션(Content-Disposition)에만 기대면 서버의
// 비-ASCII 파일명 인코딩 방식에 따라 저장 대화상자에 원래 한글 파일명이 아니라 UUID가 뜰 수
// 있다 — 그래서 실제 파일을 fetch로 받아 Blob으로 만든 뒤 <a download="원본파일명">으로
// 저장한다. 이러면 브라우저가 서버 헤더와 무관하게 항상 지정한 이름으로 저장한다.
export async function downloadAttachment(attachment) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.storage_path, 3600);
  if (error) throw error;
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.file_name;
  a.click();
  URL.revokeObjectURL(url);
}

export function isPdfAttachment(attachment) {
  return /\.pdf$/i.test(attachment.file_name);
}

// PDF는 브라우저 내장 뷰어로 새 탭에서 바로 볼 수 있어 다운로드 대신 미리보기를 띄운다.
// win은 클릭 핸들러에서 동기적으로 window.open('', '_blank')로 미리 열어 넘겨받은 빈 탭 —
// fetch의 await 이후에 열면 사용자 제스처 컨텍스트를 벗어나 팝업 차단에 걸리기 때문에,
// 탭은 미리 열고 Blob URL만 나중에 채워 넣는다(다운로드와 달리 새 탭이 계속 참조하므로
// revokeObjectURL은 호출하지 않는다 — 탭이 닫히면 브라우저가 알아서 정리한다).
export async function previewPdfAttachment(attachment, win) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment.storage_path, 3600);
  if (error) {
    win?.close();
    throw error;
  }
  const res = await fetch(data.signedUrl);
  if (!res.ok) {
    win?.close();
    throw new Error(`미리보기 실패 (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (win) win.location.href = url;
  else window.open(url, '_blank');
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// 문서/규정/부서게시글·프로젝트 화면에서 공통으로 쓰는 첨부파일 목록 위젯.
// container 안에 자체적으로 렌더링·이벤트 바인딩까지 마치고, 변경 시 스스로 다시 그린다.
// allowUpload/allowDelete로 화면 성격에 맞게 기능을 뺄 수 있다 — 예: 전자결재는 "입력 중"
// 화면(작성 폼)에서만 업로드하고, "확인" 화면(상세보기)은 열람 전용(둘 다 false)으로 둬서
// 입력 단계와 열람 단계가 섞이지 않게 한다.
export async function renderAttachmentsWidget(container, targetType, targetId, userEmail, options = {}) {
  const { allowUpload = true, allowDelete = true } = options;
  const list = await listAttachments(targetType, targetId);

  container.innerHTML = `
    <h3>첨부파일</h3>
    ${list.length === 0 ? '<p class="note">첨부된 파일이 없습니다.</p>' : `<table>
      <tr><th>파일명</th><th>크기</th><th>업로드</th>${allowDelete ? '<th></th>' : ''}</tr>
      ${list
        .map(
          (a) => `<tr>
            <td><a href="#" data-dl="${a.attachment_id}">${esc(a.file_name)}</a>${isPdfAttachment(a) ? ' <span class="note">(미리보기)</span>' : ''}</td>
            <td class="c">${fmtSize(a.file_size)}</td>
            <td class="c">${esc(a.uploaded_by ?? '')}</td>
            ${allowDelete ? `<td class="c"><button class="btn sm ghost" data-del="${a.attachment_id}">삭제</button></td>` : ''}
          </tr>`
        )
        .join('')}
    </table>`}
    ${
      allowUpload
        ? `<div class="toolbar" style="margin-top:10px">
      <input type="file" id="attFile">
      <button class="btn sm" id="attUploadBtn">업로드</button>
      <span class="err" id="attErr"></span>
    </div>
    <p class="note">PDF·HWPX·Word 등 파일 형식 제한 없이 첨부할 수 있습니다. 사진(JPG/PNG)은 업로드 시 자동으로 용량을 줄입니다.</p>`
        : ''
    }`;

  const byId = (id) => list.find((a) => a.attachment_id === Number(id));
  const refresh = () => renderAttachmentsWidget(container, targetType, targetId, userEmail, options);

  container.querySelectorAll('[data-dl]').forEach((a) => {
    a.onclick = (ev) => {
      ev.preventDefault();
      const attachment = byId(a.dataset.dl);
      if (isPdfAttachment(attachment)) {
        const win = window.open('', '_blank');
        previewPdfAttachment(attachment, win).catch((err) => alert('미리보기 실패: ' + err.message));
      } else {
        downloadAttachment(attachment).catch((err) => alert('다운로드 실패: ' + err.message));
      }
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

  if (allowUpload) {
    document.getElementById('attUploadBtn').onclick = async () => {
      const input = document.getElementById('attFile');
      const errEl = document.getElementById('attErr');
      const btn = document.getElementById('attUploadBtn');
      errEl.textContent = '';
      if (!input.files[0]) return;
      btn.disabled = true;
      btn.textContent = '업로드 중…';
      try {
        await uploadAttachment(targetType, targetId, input.files[0], userEmail);
        refresh();
      } catch (err) {
        errEl.textContent = '업로드 실패: ' + err.message;
        btn.disabled = false;
        btn.textContent = '업로드';
      }
    };
  }
}
