import { supabase } from '../lib/supabaseClient.js';

export function renderLogin(container) {
  container.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <h2>로그인</h2>
      <form id="loginForm">
        <label>이메일</label>
        <input type="email" id="email" required autocomplete="username">
        <label>비밀번호</label>
        <input type="password" id="password" required autocomplete="current-password">
        <button class="btn" type="submit">로그인</button>
        <p class="err" id="loginErr"></p>
      </form>
      <p class="note">계정은 Supabase 대시보드(Authentication)에서 발급받으세요.</p>
    </div>
  </div>`;

  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('loginErr');
    const btn = form.querySelector('button');
    errEl.textContent = '';
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) errEl.textContent = '로그인 실패: ' + error.message;
  });
}
