export function fmt(n) {
  const v = Number(n) || 0;
  if (v === 0) return '-';
  return v < 0 ? `(${Math.abs(v).toLocaleString()})` : v.toLocaleString();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
