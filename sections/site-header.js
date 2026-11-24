(() => {
  const header = document.querySelector('#site-header');
  const menu = document.querySelector('#menu-button');
  const nav = document.querySelector('#primary-nav');
  if (!header || !menu || !nav) return;

  const closeMenu = () => {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '메뉴 열기');
    document.body.classList.remove('menu-open');
  };
  // Existing landing pages already bind their menu buttons in inline scripts.
  if (header.dataset.headerMenu === 'shared') {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
      document.body.classList.toggle('menu-open', open);
    });
  }
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      closeMenu();
      menu.focus();
    }
  });
  const desktop = matchMedia('(min-width: 1200px)');
  desktop.addEventListener('change', event => { if (event.matches) closeMenu(); });

  // A few campaign pages insert their destination sections asynchronously.
  // Keep native anchor behavior, then align an initial deep link after insertion.
  const alignHash = () => {
    const id = location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  let observer;
  let observerTimeout;
  const stopWatching = () => {
    observer?.disconnect();
    clearTimeout(observerTimeout);
  };
  const watchHash = () => {
    stopWatching();
    if (!location.hash) return;
    alignHash();
    if (!document.querySelector('script[src*="shared-sections.js"]')) return;
    observer = new MutationObserver(records => {
      if (records.some(record => record.addedNodes.length || record.removedNodes.length)) alignHash();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observerTimeout = setTimeout(stopWatching, 5000);
  };
  watchHash();
  addEventListener('hashchange', watchHash);
  addEventListener('wheel', stopWatching, { passive: true });
  addEventListener('touchstart', stopWatching, { passive: true });
})();
