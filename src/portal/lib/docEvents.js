import { supabase } from '../../lib/supabaseClient.js';

export const EVENT_LABEL = {
  create: '기안 작성',
  submit: '상신',
  resubmit: '재상신',
  approve: '승인',
  reject: '반려',
  recall: '회수',
  seal: '직인 날인',
};

async function currentEmail() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

// 결재 이력은 문서 상태 변경과 별개로 한 줄씩 쌓는다 — 문서 행에는 마지막 결정만 남아
// 반려 후 재상신하면 이전 처리 내용이 사라지기 때문. 이력 기록 실패가 업무 처리 자체를
// 막으면 안 되므로 에러는 콘솔에만 남긴다.
export async function logDocEvent(docId, eventType, note = null) {
  const { error } = await supabase.from('document_events').insert({
    doc_id: docId,
    event_type: eventType,
    actor_email: await currentEmail(),
    note: note || null,
  });
  if (error) console.error('결재 이력 기록 실패', error);
}

export async function listDocEvents(docId) {
  const { data, error } = await supabase.from('document_events').select('*').eq('doc_id', docId).order('created_at').order('event_id');
  if (error) throw error;
  return data ?? [];
}
