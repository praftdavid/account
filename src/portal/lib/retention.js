// 문서/규정 보존기한 표시 전용 — 자동 삭제 로직은 두지 않는다(삭제는 항상 사람이 직접 판단).
// "10년 보존이면 좋겠다"는 요청은 최소 10년은 안 지워지게 해달라는 뜻이지, 10년 뒤 자동으로
// 지워달라는 뜻이 아니라서, 여기서는 안내용 날짜 계산·표시만 한다.
const RETENTION_YEARS = 10;

export function retentionDeadline(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  d.setFullYear(d.getFullYear() + RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}
