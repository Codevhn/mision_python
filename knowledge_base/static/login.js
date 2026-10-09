/* Keep appearance and form feedback local; authentication remains server-side. */
(() => {
  const dialog = document.getElementById('loginThemes');
  const options = document.getElementById('loginThemeOptions');
  for (const [id,title] of THEME_CATALOG) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = title; button.dataset.themeChoice = id;
    button.setAttribute('aria-pressed', String(id === document.documentElement.dataset.themeId));
    button.addEventListener('click', () => {
      applyLoginTheme(id);
      try { localStorage.setItem('kb_theme', id); } catch {}
      options.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      dialog.close();
    }); options.append(button);
  }
  document.getElementById('loginThemeToggle').addEventListener('click', () => dialog.showModal());
  document.getElementById('closeThemes').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  const password = document.getElementById('password'), reveal = document.getElementById('showPassword');
  reveal.addEventListener('click', () => {
    const show = password.type === 'password'; password.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show)); reveal.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  function reset() {
    document.querySelector('.login-submit').disabled = false;
    document.getElementById('submitLabel').textContent = 'Entrar a Atlas';
    document.getElementById('loginStatus').textContent = '';
    document.getElementById('loginForm').removeAttribute('aria-busy');
  }
  window.addEventListener('pageshow', reset);
  document.getElementById('loginForm').addEventListener('submit', () => {
    document.querySelector('.login-submit').disabled = true;
    document.getElementById('submitLabel').textContent = 'Entrando…';
    document.getElementById('loginStatus').textContent = 'Comprobando acceso a tu espacio…';
    document.getElementById('loginForm').setAttribute('aria-busy', 'true');
  });
})();
