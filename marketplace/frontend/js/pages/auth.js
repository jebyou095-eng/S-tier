import { post } from '../api.js';
import { auth } from '../store.js';
import { go } from '../router.js';
import { $, esc, toast, busy } from '../ui.js';

export default async function authPage(app, { path, query }) {
  const isLogin = path === '/login';
  const next = query.get('next') || '#/';
  if (auth.loggedIn) { go(next); return; }

  app.innerHTML = `
  <div class="auth">
    <div class="auth__art"><img src="https://images.unsplash.com/photo-${isLogin ? '1441986300917-64674bd600d8' : '1472851294608-062f824d29cc'}?w=1400&q=80&auto=format&fit=crop" alt="" />
      <blockquote class="fade-up" style="--d:.4s">${isLogin ? '“The best things in life are<br/><em>already made.</em>”' : 'Join thousands of people giving good things a <em>second story.</em>'}</blockquote></div>
    <div class="auth__form">
      <form id="authForm" novalidate>
        <span class="eyebrow fade-up">${isLogin ? 'Welcome back' : 'Create an account'}</span>
        <h1 class="fade-up" style="--d:.06s">${isLogin ? 'Log <em>in</em>' : 'Join <em>Agora</em>'}</h1>
        <p class="muted fade-up" style="--d:.1s">${isLogin ? `New here? <a class="link" href="#/register${query.get('next') ? '?next=' + encodeURIComponent(next) : ''}">Create an account</a>` : `Already a member? <a class="link" href="#/login">Log in</a>`}</p>
        ${isLogin ? `<div class="demo-hint fade-up" style="--d:.14s" id="demo">✨ <b>Try the demo:</b> demo@agora.test / demo1234 <span class="muted">(click to fill)</span></div>` : '<div style="height:24px"></div>'}
        <div id="err"></div>
        ${isLogin ? '' : `<div class="field fade-up" style="--d:.16s"><label for="name">Full name</label><input class="input" id="name" name="name" autocomplete="name" required /></div>`}
        <div class="field fade-up" style="--d:.2s"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required /></div>
        <div class="field fade-up" style="--d:.24s"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6" required />
          ${isLogin ? '' : '<small>At least 6 characters.</small>'}</div>
        <button class="btn btn--ink btn--lg btn--block fade-up" style="--d:.28s;margin-top:8px">${isLogin ? 'Log in' : 'Create account'} <span class="arrow">→</span></button>
      </form>
    </div>
  </div>`;

  const f = $('#authForm');
  $('#demo')?.addEventListener('click', () => { f.email.value = 'demo@agora.test'; f.password.value = 'demo1234'; f.email.focus(); });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = { email: f.email.value, password: f.password.value, ...(isLogin ? {} : { name: f.name.value }) };
    try {
      const r = await busy(f.querySelector('button'), () => post(isLogin ? '/auth/login' : '/auth/register', body));
      auth.set(r.token, r.user);
      toast(isLogin ? `Welcome back, ${r.user.name.split(' ')[0]}!` : `Welcome to Agora, ${r.user.name.split(' ')[0]}! 🎉`);
      go(next);
    } catch (err) {
      $('#err').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      f.querySelectorAll('.input').forEach(i => { i.classList.remove('invalid'); void i.offsetWidth; if (!i.value) i.classList.add('invalid'); });
    }
  };
}
