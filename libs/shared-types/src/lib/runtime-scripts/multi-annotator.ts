/// <reference path="./types.d.ts" />

// Multi-Annotation Tool — lets users click multiple elements and annotate each one
(function () {
  let multiActive = false;
  let nextIndex = 1;
  const items = new Map<number, { element: HTMLElement; badge: HTMLDivElement; elementId: string | null; note: string }>(); // index -> { element, badge, elementId, note }

  function getElementData(target: HTMLElement): {
    tagName: string;
    text: string;
    componentName: string | null;
    hostTag: string | null;
    elementId: string | null;
    ongAnnotation: OngAnnotation | null;
    classes: string;
    attributes: { id: string; type: string | null };
  } {
    let componentName: string | null = null;
    let hostTag: string | null = null;
    if (window.ng) {
      let el: Element | null = target;
      while (el) {
        let comp = window.ng.getComponent(el);
        if (!comp) comp = window.ng.getOwningComponent(el);
        if (comp && comp.constructor) {
          componentName = comp.constructor.name;
          if (componentName!.startsWith('_')) componentName = componentName!.substring(1);
          let hostEl: Element | null = el;
          while (hostEl && !hostEl.tagName.includes('-')) hostEl = hostEl.parentElement;
          if (hostEl) hostTag = hostEl.tagName.toLowerCase();
          break;
        }
        el = el.parentElement;
      }
    }
    return {
      tagName: target.tagName.toLowerCase(),
      text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
      componentName: componentName,
      hostTag: hostTag,
      elementId: __getElementId(target),
      ongAnnotation: __getOngAnnotation(target),
      classes: target.className || '',
      attributes: { id: target.id, type: target.getAttribute('type') }
    };
  }

  function createBadge(index: number, element: HTMLElement): HTMLDivElement {
    const badge = document.createElement('div');
    badge.className = '__multi-ann-badge';
    badge.dataset['multiAnnIndex'] = String(index);
    badge.textContent = String(index);
    badge.style.cssText = 'position:fixed;z-index:1000000;width:22px;height:22px;border-radius:50%;' +
      'background:#6366f1;color:#fff;font-size:11px;font-weight:700;font-family:system-ui,sans-serif;' +
      'display:flex;align-items:center;justify-content:center;cursor:pointer;' +
      'box-shadow:0 1px 4px rgba(0,0,0,0.3);pointer-events:auto;transition:background 0.2s;';

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = '__multi-ann-tooltip';
    tooltip.textContent = 'No note yet';
    tooltip.style.cssText = 'position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);' +
      'background:#1e1e2e;color:#cdd6f4;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:400;' +
      'white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;' +
      'opacity:0;transition:opacity 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    badge.appendChild(tooltip);

    badge.addEventListener('mouseenter', () => { tooltip.style.opacity = '1'; });
    badge.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });

    badge.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'MULTI_ANNOTATION_CLICKED', index: index }, '*');
    });

    document.body.appendChild(badge);
    return badge;
  }

  function positionBadge(badge: HTMLDivElement, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    badge.style.top = (rect.top - 4) + 'px';
    badge.style.left = (rect.right - 10) + 'px';
  }

  function updateAllBadgePositions(): void {
    items.forEach((item) => {
      if (!document.body.contains(item.element) && item.elementId) {
        const found = __findElementById(item.elementId) as HTMLElement | null;
        if (found) {
          item.element = found;
          item.element.style.outline = '2px dashed #6366f1';
          item.element.style.outlineOffset = '2px';
        }
      }
      if (document.body.contains(item.element)) {
        positionBadge(item.badge, item.element);
      }
    });
  }

  function addElement(target: HTMLElement): void {
    // Check if already annotated
    for (const [, item] of items) {
      if (item.element === target) return;
      if (item.elementId && item.elementId === __getElementId(target)) return;
    }

    const index = nextIndex++;
    const badge = createBadge(index, target);
    positionBadge(badge, target);

    // Outline on the element
    target.style.outline = '2px dashed #6366f1';
    target.style.outlineOffset = '2px';

    const elementId = __getElementId(target);
    items.set(index, { element: target, badge: badge, elementId: elementId, note: '' });

    const data = getElementData(target);
    window.parent.postMessage({
      type: 'MULTI_ELEMENT_ADDED',
      payload: { ...data, index: index }
    }, '*');
  }

  function removeItem(index: number): void {
    const item = items.get(index);
    if (!item) return;
    item.badge.remove();
    if (document.body.contains(item.element)) {
      item.element.style.outline = '';
      item.element.style.outlineOffset = '';
    }
    items.delete(index);
  }

  function hideAll(): void {
    items.forEach((item) => {
      item.badge.style.display = 'none';
      if (document.body.contains(item.element)) {
        item.element.style.outline = '';
        item.element.style.outlineOffset = '';
      }
    });
  }

  function showAll(): void {
    items.forEach((item) => {
      item.badge.style.display = 'flex';
      if (document.body.contains(item.element)) {
        item.element.style.outline = '2px dashed #6366f1';
        item.element.style.outlineOffset = '2px';
      }
    });
    updateAllBadgePositions();
  }

  function clearAll(): void {
    items.forEach((item) => {
      item.badge.remove();
      if (document.body.contains(item.element)) {
        item.element.style.outline = '';
        item.element.style.outlineOffset = '';
      }
    });
    items.clear();
    nextIndex = 1;
  }

  // Scroll/resize tracking
  let rafPending = false;
  function schedulePositionUpdate(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updateAllBadgePositions();
    });
  }
  window.addEventListener('scroll', schedulePositionUpdate, true);
  window.addEventListener('resize', schedulePositionUpdate);

  // MutationObserver to reposition after DOM changes (HMR etc.)
  let multiDomObserver: MutationObserver | null = null;
  function startMultiObserver(): void {
    if (multiDomObserver) return;
    multiDomObserver = new MutationObserver(schedulePositionUpdate);
    multiDomObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  function stopMultiObserver(): void {
    if (multiDomObserver) { multiDomObserver.disconnect(); multiDomObserver = null; }
  }

  // Click handler for multi-annotate mode
  function onMultiClick(e: MouseEvent): void {
    if (!multiActive) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (!target || target === document.body || target === document.documentElement) return;
    // Ignore clicks on badges
    if (target.closest && target.closest('.__multi-ann-badge')) return;

    addElement(target);
  }

  // Hover overlay for multi-annotate
  let multiHoverOverlay: HTMLDivElement | null = null;
  function ensureMultiHoverOverlay(): void {
    if (document.getElementById('__multi-ann-hover')) return;
    multiHoverOverlay = document.createElement('div');
    multiHoverOverlay.id = '__multi-ann-hover';
    multiHoverOverlay.style.cssText = 'position:fixed;border:2px solid #6366f1;background:transparent;' +
      'z-index:999998;pointer-events:none;display:none;border-radius:2px;';
    document.body.appendChild(multiHoverOverlay);
  }

  function onMultiHover(e: MouseEvent): void {
    if (!multiActive) return;
    const target = e.target as HTMLElement;
    if (!multiHoverOverlay || !target || target === document.body || target === document.documentElement) return;
    if (target.closest && target.closest('.__multi-ann-badge')) {
      multiHoverOverlay.style.display = 'none';
      return;
    }
    const rect = target.getBoundingClientRect();
    multiHoverOverlay.style.top = rect.top + 'px';
    multiHoverOverlay.style.left = rect.left + 'px';
    multiHoverOverlay.style.width = rect.width + 'px';
    multiHoverOverlay.style.height = rect.height + 'px';
    multiHoverOverlay.style.display = 'block';
  }

  document.addEventListener('click', onMultiClick, true);
  document.addEventListener('mouseover', onMultiHover);
  document.addEventListener('mouseleave', () => {
    if (multiHoverOverlay) multiHoverOverlay.style.display = 'none';
  });

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data.type === 'TOGGLE_MULTI_ANNOTATOR') {
      multiActive = event.data.enabled;
      if (multiActive) {
        ensureMultiHoverOverlay();
        startMultiObserver();
        showAll();
      } else {
        if (multiHoverOverlay) multiHoverOverlay.style.display = 'none';
        stopMultiObserver();
        hideAll();
      }
    }

    if (event.data.type === 'MULTI_ANNOTATE_REMOVE') {
      removeItem(event.data.index);
    }

    if (event.data.type === 'MULTI_ANNOTATE_CLEAR') {
      clearAll();
    }

    if (event.data.type === 'MULTI_ANNOTATE_UPDATE_NOTE') {
      const item = items.get(event.data.index);
      if (item) {
        item.note = event.data.note || '';
        const badge = item.badge;
        const tooltip = badge.querySelector('.__multi-ann-tooltip') as HTMLElement | null;
        if (tooltip) {
          tooltip.textContent = item.note || 'No note yet';
        }
        // Visual indicator: filled when note exists
        if (item.note) {
          badge.style.background = '#4f46e5';
          badge.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.4), 0 1px 4px rgba(0,0,0,0.3)';
        } else {
          badge.style.background = '#6366f1';
          badge.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
        }
      }
    }
  });
})();
