import { esc } from './util.js';

// 문서 포털과 관리회계 포털이 같은 계정 메뉴를 쓴다(오른쪽 위 둥근 버튼 → 이메일·이동·로그아웃).
// items: { heading } | { divider: true } | { label, run } | { label, href }
let outsideBound = false;

export function renderAccountMenu(el, email, items) {
  const body = items
    .map((it, i) => {
      if (it.heading) return `<div class="acct-sec">${esc(it.heading)}</div>`;
      if (it.divider) return '<div class="acct-sec"></div>';
      if (it.href) return `<a href="${esc(it.href)}">${esc(it.label)}</a>`;
      return `<button data-acct="${i}">${esc(it.label)}</button>`;
    })
    .join('');
  el.innerHTML = `<div class="acct">
    <button class="acct-btn" id="acctBtn" aria-label="계정 메뉴">${esc((email ?? '?')[0].toUpperCase())}</button>
    <div class="acct-pop" id="acctPop" hidden><div class="acct-mail">${esc(email ?? '')}</div>${body}</div>
  </div>`;
  const pop = el.querySelector('#acctPop');
  el.querySelector('#acctBtn').onclick = (ev) => { ev.stopPropagation(); pop.hidden = !pop.hidden; };
  pop.onclick = (ev) => ev.stopPropagation();
  el.querySelectorAll('[data-acct]').forEach((b) => (b.onclick = () => { pop.hidden = true; items[Number(b.dataset.acct)].run(); }));
  if (!outsideBound) {
    outsideBound = true;
    document.addEventListener('click', () => { const p = document.getElementById('acctPop'); if (p) p.hidden = true; });
  }
}
