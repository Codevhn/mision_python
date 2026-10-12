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
  // Do not open the phone keyboard before the user chooses to enter.
  if (matchMedia('(min-width:769px) and (pointer:fine)').matches) password.focus({preventScroll:true});
  reveal.addEventListener('pointerdown', event => {
    if (document.activeElement === password) event.preventDefault();
  });
  reveal.addEventListener('click', () => {
    const show = password.type === 'password'; password.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show)); reveal.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
  // Android may shrink only the visual viewport when the keyboard opens.
  // Compact the welcome area while it is open, leaving native scrolling free.
  const viewport = window.visualViewport;
  let fullHeight = viewport?.height || innerHeight, fullWidth = innerWidth;
  function updateKeyboardLayout() {
    if (innerWidth !== fullWidth) { fullWidth = innerWidth; fullHeight = viewport?.height || innerHeight; }
    if (document.activeElement !== password) fullHeight = Math.max(fullHeight, viewport?.height || innerHeight);
    document.body.classList.toggle('login-keyboard-open', document.activeElement === password && fullHeight - (viewport?.height || innerHeight) > 140);
  }
  viewport?.addEventListener('resize', updateKeyboardLayout);
  window.addEventListener('resize', updateKeyboardLayout);
  password.addEventListener('focus', updateKeyboardLayout);
  password.addEventListener('blur', updateKeyboardLayout);
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
