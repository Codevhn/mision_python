/* Shared Centinela chrome. Decoration never replaces content or controls. */
(() => {
  'use strict';
  const root = document.documentElement;
  const frames = new Set(['sentinel', 'classic']);
  function setFrame(value, persist = false) {
    root.dataset.frame = frames.has(value) ? value : 'sentinel';
    if (persist) { try { localStorage.setItem('kb_frame', root.dataset.frame); } catch {} }
    document.querySelectorAll('[data-atlas-frame-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.atlasFrameChoice === root.dataset.frame));
    });
  }
  // Run before styles paint; embedded Finance follows its parent preference.
  let saved = 'sentinel';
  try { saved = window.parent !== window ? window.parent.document.documentElement.dataset.frame : localStorage.getItem('kb_frame'); } catch {}
  setFrame(saved);
  window.setAtlasFrame = setFrame;
  window.addEventListener('storage', event => { if (event.key === 'kb_frame') setFrame(event.newValue); });

  function mount() {
    const windows = [
      '.welcome', '.entry-view', '.course-view', '.course-empty-state', '.kanban-area',
      '.mindmap-area', '.concept-map-area', '.diagram-area', '.graph-view', '.radar-view',
      '.practice-view', '.lab-view', '.reader-shell', '.assistant-area', '.ai-panel',
      '.scratchpad', '.modal', 'dialog:not(.ag-dialog):not(.transaction-dialog)',
      '.cmd-modal', '.login-window', '.share-page', '.sr-page',
    ].join(',');
    const panels = [
      '#activityBar', '#sidebar', '.related-sidebar', '.toc-panel', '.history-panel',
      '.practice-rail', '.dg-panel', '.reader-toc-panel', '.assistant-history',
      '.move-panel', '.content-panel', '.feature-panel',
    ].join(',');
    const bars = '#topbar,.login-topbar';
    const selector = [windows, panels, bars].join(',');
    const intersection = new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.classList.toggle('atlas-frame-in-view', entry.isIntersecting);
    });
    const watched = new Set();
    function anchorDecoration(element) {
      const decoration=element.querySelector(':scope > .atlas-frame-decoration');
      if (!decoration) return;
      // Absolute chrome belongs to the viewport of a scrolling window, not
      // to its content. Compensate only the decorative layer's scroll offset.
      decoration.style.translate=element.scrollTop || element.scrollLeft
        ? `${element.scrollLeft}px ${element.scrollTop}px` : '';
    }
    function decorate(element) {
      if (!element.matches(selector)) return;
      element.classList.add('atlas-frame');
      element.dataset.atlasFrameKind = element.matches(bars) ? 'bar' : element.matches(panels) ? 'panel' : 'window';
      // Keep absolute/fixed/sticky positioning used by canvases and drawers.
      if (getComputedStyle(element).position === 'static') element.classList.add('atlas-frame-relative');
      if (!element.querySelector(':scope > .atlas-frame-decoration')) {
        const decoration = document.createElement('span');
        decoration.className = 'atlas-frame-decoration'; decoration.setAttribute('aria-hidden', 'true');
        decoration.inert = true;
        const corners = document.createElement('span'); corners.className = 'atlas-frame-corners';
        decoration.append(corners); element.append(decoration);
      }
      anchorDecoration(element);
      if (!watched.has(element)) {
        watched.add(element); intersection.observe(element);
        element.addEventListener('scroll',()=>anchorDecoration(element),{passive:true});
      }
    }
    function scan(element) {
      if (!(element instanceof Element) || element.closest('.atlas-frame-decoration')) return;
      decorate(element); element.querySelectorAll(selector).forEach(decorate);
    }
    scan(document.body);
    // Views and dialogs also arrive through innerHTML/API rendering. Re-attach
    // only the missing chrome, without rewriting any application markup.
    const observer = new MutationObserver(records => {
      const changed = new Set();
      for (const record of records) {
        if (record.target instanceof Element && record.target.matches(selector)) changed.add(record.target);
        for (const element of record.addedNodes) if (element instanceof Element && !element.matches('.atlas-frame-decoration')) changed.add(element);
      }
      changed.forEach(scan);
      for (const element of watched) if (!element.isConnected) { intersection.unobserve(element); watched.delete(element); }
    });
    observer.observe(document.body, { childList:true, subtree:true });
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-atlas-frame-choice]');
      if (button) setFrame(button.dataset.atlasFrameChoice, true);
    });
    const pause = () => root.classList.toggle('atlas-frames-paused', document.hidden);
    document.addEventListener('visibilitychange', pause); pause(); setFrame(root.dataset.frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
