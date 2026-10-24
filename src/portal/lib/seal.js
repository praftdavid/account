import { supabase } from '../../lib/supabaseClient.js';
import { logDocEvent } from './docEvents.js';

const BUCKET = 'portal-files';
const MAX_SIDE = 400;

// 도장 사진/스캔은 흰 배경이 그대로 박혀 있어 글자를 가리므로, 업로드할 때 거의 흰색인
// 픽셀을 투명하게 바꾼 PNG로 저장한다(이미 배경이 투명한 PNG면 그대로 유지된다).
export async function processSealImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 235 && img.data[i + 1] > 235 && img.data[i + 2] > 235) img.data[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function fetchSeals() {
  const { data, error } = await supabase.from('seals').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSeal(sealId) {
  const { data } = await supabase.from('seals').select('*').eq('seal_id', sealId).maybeSingle();
  return data ?? null;
}

export async function fetchActiveSeal() {
  const { data } = await supabase.from('seals').select('*').eq('is_active', true).maybeSingle();
  return data ?? null;
}

// 화면·PDF 캡처에서 쓰도록 서명 URL로 받은 이미지를 data URL로 바꿔 돌려준다(data URL이면
// html2canvas가 CORS 걱정 없이 그릴 수 있다).
export async function loadSealImage(seal) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(seal.storage_path, 3600);
  if (error) throw error;
  const res = await fetch(data.signedUrl);
  if (!res.ok) throw new Error(`직인 이미지를 불러오지 못했습니다 (${res.status})`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { dataUrl };
}

export async function uploadSeal(name, file, email) {
  const blob = await processSealImage(file);
  const path = `seal/${Date.now()}_${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png' });
  if (upErr) throw upErr;
  const { error } = await supabase.from('seals').insert({ name, storage_path: path, created_by: email });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

// 날인은 한 번 하면 되돌리지 않는다 — 문서에 직인 정보를 박고, 날인기록부에 한 줄 남기고,
// 결재 이력에도 남긴다. 문서가 나중에 삭제돼도 기록부에는 번호·제목이 문자열로 남는다.
export async function sealDocument(doc, seal, email) {
  const sealedAt = new Date().toISOString();
  const { error } = await supabase.from('documents').update({ seal_id: seal.seal_id, sealed_at: sealedAt, sealed_by: email }).eq('doc_id', doc.doc_id);
  if (error) throw error;
  const { error: logErr } = await supabase.from('seal_logs').insert({
    doc_id: doc.doc_id,
    doc_no: doc.doc_no,
    doc_title: doc.title,
    seal_id: seal.seal_id,
    seal_name: seal.name,
    sealed_by: email,
    sealed_at: sealedAt,
  });
  if (logErr) console.error('날인기록부 기록 실패', logErr);
  await logDocEvent(doc.doc_id, 'seal', seal.name);
}
