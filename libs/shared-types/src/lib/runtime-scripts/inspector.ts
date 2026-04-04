/// <reference path="./types.d.ts" />

// Visual Inspector Script
(function () {
  let active = false;
  let measureMode = false;
  let overlay: HTMLDivElement | null = null;
  let selectionOverlay: HTMLDivElement | null = null;
  let selectedElement: HTMLElement | null = null;
  let clickTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingClickEvent: MouseEvent | null = null;

  // ─── Measurement Overlay Helpers ───
  let measureContainer: HTMLDivElement | null = null;

  function ensureMeasureContainer(): HTMLDivElement {
    const existing = document.getElementById('__measure-overlay') as HTMLDivElement | null;
    if (existing) return existing;
    measureContainer = document.createElement('div');
    measureContainer.id = '__measure-overlay';
    measureContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999997;';
    document.body.appendChild(measureContainer);
    return measureContainer;
  }

  function clearMeasureOverlay(): void {
    const c = document.getElementById('__measure-overlay');
    if (c) c.innerHTML = '';
  }

  function createPill(text: string, color: string, x: number, y: number): HTMLDivElement {
    const pill = document.createElement('div');
    pill.style.cssText = 'position:fixed;padding:1px 5px;border-radius:3px;font-size:10px;font-family:system-ui,sans-serif;font-weight:600;white-space:nowrap;pointer-events:none;line-height:14px;z-index:999999;';
    pill.style.background = color;
    pill.style.color = '#fff';
    pill.style.left = x + 'px';
    pill.style.top = y + 'px';
    pill.textContent = text;
    return pill;
  }

  function createLine(x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean): HTMLDivElement {
    const line = document.createElement('div');
    const isVert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    if (isVert) {
      const top = Math.min(y1, y2);
      const h = Math.abs(y2 - y1);
      line.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;';
      line.style.left = x1 + 'px';
      line.style.top = top + 'px';
      line.style.width = '1px';
      line.style.height = h + 'px';
      line.style.background = color;
      if (dashed) { line.style.background = 'none'; line.style.borderLeft = '1px dashed ' + color; }
    } else {
      const left = Math.min(x1, x2);
      const w = Math.abs(x2 - x1);
      line.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;';
      line.style.left = left + 'px';
      line.style.top = y1 + 'px';
      line.style.width = w + 'px';
      line.style.height = '1px';
      line.style.background = color;
      if (dashed) { line.style.background = 'none'; line.style.borderTop = '1px dashed ' + color; }
    }
    return line;
  }

  function createCap(x: number, y: number, isVertical: boolean, color: string): HTMLDivElement {
    const cap = document.createElement('div');
    cap.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;background:' + color + ';';
    if (isVertical) {
      cap.style.left = (x - 3) + 'px';
      cap.style.top = y + 'px';
      cap.style.width = '7px';
      cap.style.height = '1px';
    } else {
      cap.style.left = x + 'px';
      cap.style.top = (y - 3) + 'px';
      cap.style.width = '1px';
      cap.style.height = '7px';
    }
    return cap;
  }

  function createBox(x: number, y: number, w: number, h: number, color: string): HTMLDivElement {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:999997;';
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.style.background = color;
    return box;
  }

  // Show width x height near element
  function showElementDimensions(container: HTMLElement, rect: DOMRect): void {
    const text = Math.round(rect.width) + ' × ' + Math.round(rect.height);
    const pill = createPill(text, '#2196F3', rect.left + rect.width / 2 - 20, rect.bottom + 4);
    container.appendChild(pill);
  }

  // Distance guides between selected and hovered rects
  function showDistanceGuides(container: HTMLElement, selRect: DOMRect, hovRect: DOMRect): void {
    const color = '#FF4081';
    // Horizontal distance
    const selCenterY = selRect.top + selRect.height / 2;
    const hovCenterY = hovRect.top + hovRect.height / 2;
    const selCenterX = selRect.left + selRect.width / 2;
    const hovCenterX = hovRect.left + hovRect.width / 2;

    // Vertical gap (no Y overlap)
    if (selRect.bottom <= hovRect.top) {
      const dist = Math.round(hovRect.top - selRect.bottom);
      const x = Math.min(selCenterX, hovCenterX);
      container.appendChild(createLine(x, selRect.bottom, x, hovRect.top, color, false));
      container.appendChild(createCap(x, selRect.bottom, false, color));
      container.appendChild(createCap(x, hovRect.top, false, color));
      if (dist > 0) container.appendChild(createPill(dist + 'px', color, x + 4, selRect.bottom + (hovRect.top - selRect.bottom) / 2 - 8));
    } else if (hovRect.bottom <= selRect.top) {
      const dist = Math.round(selRect.top - hovRect.bottom);
      const x = Math.min(selCenterX, hovCenterX);
      container.appendChild(createLine(x, hovRect.bottom, x, selRect.top, color, false));
      container.appendChild(createCap(x, hovRect.bottom, false, color));
      container.appendChild(createCap(x, selRect.top, false, color));
      if (dist > 0) container.appendChild(createPill(dist + 'px', color, x + 4, hovRect.bottom + (selRect.top - hovRect.bottom) / 2 - 8));
    }

    // Horizontal gap (no X overlap)
    if (selRect.right <= hovRect.left) {
      const dist = Math.round(hovRect.left - selRect.right);
      const y = Math.min(selCenterY, hovCenterY);
      container.appendChild(createLine(selRect.right, y, hovRect.left, y, color, false));
      container.appendChild(createCap(selRect.right, y, true, color));
      container.appendChild(createCap(hovRect.left, y, true, color));
      if (dist > 0) container.appendChild(createPill(dist + 'px', color, selRect.right + (hovRect.left - selRect.right) / 2 - 12, y - 16));
    } else if (hovRect.right <= selRect.left) {
      const dist = Math.round(selRect.left - hovRect.right);
      const y = Math.min(selCenterY, hovCenterY);
      container.appendChild(createLine(hovRect.right, y, selRect.left, y, color, false));
      container.appendChild(createCap(hovRect.right, y, true, color));
      container.appendChild(createCap(selRect.left, y, true, color));
      if (dist > 0) container.appendChild(createPill(dist + 'px', color, hovRect.right + (selRect.left - hovRect.right) / 2 - 12, y - 16));
    }
  }

  // Distances from element to parent edges
  function showParentRelativeDistances(container: HTMLElement, element: HTMLElement): void {
    const parent = element.offsetParent || element.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return;
    const eRect = element.getBoundingClientRect();
    const pRect = parent.getBoundingClientRect();
    const color = '#FF9800';

    const distTop = Math.round(eRect.top - pRect.top);
    const distBottom = Math.round(pRect.bottom - eRect.bottom);
    const distLeft = Math.round(eRect.left - pRect.left);
    const distRight = Math.round(pRect.right - eRect.right);
    const cx = eRect.left + eRect.width / 2;
    const cy = eRect.top + eRect.height / 2;

    if (distTop > 0) {
      container.appendChild(createLine(cx, pRect.top, cx, eRect.top, color, true));
      container.appendChild(createPill(distTop + 'px', color, cx + 4, pRect.top + distTop / 2 - 8));
    }
    if (distBottom > 0) {
      container.appendChild(createLine(cx, eRect.bottom, cx, pRect.bottom, color, true));
      container.appendChild(createPill(distBottom + 'px', color, cx + 4, eRect.bottom + distBottom / 2 - 8));
    }
    if (distLeft > 0) {
      container.appendChild(createLine(pRect.left, cy, eRect.left, cy, color, true));
      container.appendChild(createPill(distLeft + 'px', color, pRect.left + distLeft / 2 - 12, cy - 16));
    }
    if (distRight > 0) {
      container.appendChild(createLine(eRect.right, cy, pRect.right, cy, color, true));
      container.appendChild(createPill(distRight + 'px', color, eRect.right + distRight / 2 - 12, cy - 16));
    }
  }

  // Padding visualization on element
  function showPaddingOverlay(container: HTMLElement, element: HTMLElement): void {
    const cs = window.getComputedStyle(element);
    const pTop = parseFloat(cs.paddingTop) || 0;
    const pRight = parseFloat(cs.paddingRight) || 0;
    const pBottom = parseFloat(cs.paddingBottom) || 0;
    const pLeft = parseFloat(cs.paddingLeft) || 0;
    if (pTop + pRight + pBottom + pLeft === 0) return;

    const rect = element.getBoundingClientRect();
    const padColor = 'rgba(76,175,80,0.15)';

    // Top
    if (pTop > 0) {
      container.appendChild(createBox(rect.left, rect.top, rect.width, pTop, padColor));
      if (pTop >= 8) container.appendChild(createPill(Math.round(pTop) + '', '#4CAF50', rect.left + rect.width / 2 - 8, rect.top + pTop / 2 - 7));
    }
    // Bottom
    if (pBottom > 0) {
      container.appendChild(createBox(rect.left, rect.bottom - pBottom, rect.width, pBottom, padColor));
      if (pBottom >= 8) container.appendChild(createPill(Math.round(pBottom) + '', '#4CAF50', rect.left + rect.width / 2 - 8, rect.bottom - pBottom / 2 - 7));
    }
    // Left
    if (pLeft > 0) {
      container.appendChild(createBox(rect.left, rect.top + pTop, pLeft, rect.height - pTop - pBottom, padColor));
      if (pLeft >= 12) container.appendChild(createPill(Math.round(pLeft) + '', '#4CAF50', rect.left + pLeft / 2 - 6, rect.top + rect.height / 2 - 7));
    }
    // Right
    if (pRight > 0) {
      container.appendChild(createBox(rect.right - pRight, rect.top + pTop, pRight, rect.height - pTop - pBottom, padColor));
      if (pRight >= 12) container.appendChild(createPill(Math.round(pRight) + '', '#4CAF50', rect.right - pRight / 2 - 6, rect.top + rect.height / 2 - 7));
    }
  }

  // Gap overlays for flex/grid containers
  function showAutoLayoutGaps(container: HTMLElement, element: HTMLElement): void {
    const cs = window.getComputedStyle(element);
    const display = cs.display;
    if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid' && display !== 'inline-grid') return;
    const children = Array.from(element.children).filter(function (c) {
      const s = window.getComputedStyle(c);
      return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
    });
    if (children.length < 2) return;

    const gapColor = 'rgba(255,64,129,0.12)';
    const labelColor = '#FF4081';
    const isRow = display.includes('grid') || cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse';

    for (let i = 0; i < children.length - 1; i++) {
      const r1 = children[i].getBoundingClientRect();
      const r2 = children[i + 1].getBoundingClientRect();
      if (isRow) {
        const gapLeft = Math.min(r1.right, r2.right);
        const gapRight = Math.max(r1.left, r2.left);
        if (gapRight > gapLeft) {
          const gapW = gapRight - gapLeft;
          const gapTop = Math.min(r1.top, r2.top);
          const gapH = Math.max(r1.bottom, r2.bottom) - gapTop;
          container.appendChild(createBox(gapLeft, gapTop, gapW, gapH, gapColor));
          if (gapW >= 4) container.appendChild(createPill(Math.round(gapW) + 'px', labelColor, gapLeft + gapW / 2 - 10, gapTop + gapH / 2 - 8));
        }
      } else {
        const gapTop2 = Math.min(r1.bottom, r2.bottom);
        const gapBottom2 = Math.max(r1.top, r2.top);
        if (gapBottom2 > gapTop2) {
          const gapH2 = gapBottom2 - gapTop2;
          const gapLeft2 = Math.min(r1.left, r2.left);
          const gapW2 = Math.max(r1.right, r2.right) - gapLeft2;
          container.appendChild(createBox(gapLeft2, gapTop2, gapW2, gapH2, gapColor));
          if (gapH2 >= 4) container.appendChild(createPill(Math.round(gapH2) + 'px', labelColor, gapLeft2 + gapW2 / 2 - 10, gapTop2 + gapH2 / 2 - 8));
        }
      }
    }
  }

  // Grid/Flexbox layout overlay
  function showLayoutOverlay(container: HTMLElement, element: HTMLElement): void {
    const cs = window.getComputedStyle(element);
    const display = cs.display;
    const rect = element.getBoundingClientRect();
    const gridColor = '#9C27B0';

    if (display === 'grid' || display === 'inline-grid') {
      // Grid columns
      const cols = cs.gridTemplateColumns;
      if (cols && cols !== 'none') {
        const colSizes = cols.split(/\s+/);
        let colOffset = 0;
        const colGap = parseFloat(cs.columnGap) || 0;
        for (let ci = 0; ci < colSizes.length; ci++) {
          const cw = parseFloat(colSizes[ci]);
          if (isNaN(cw)) continue;
          colOffset += cw;
          if (ci < colSizes.length - 1) {
            const lx = rect.left + colOffset + colGap * ci;
            container.appendChild(createLine(lx, rect.top, lx, rect.bottom, gridColor, true));
            container.appendChild(createPill(Math.round(cw) + 'px', gridColor, rect.left + colOffset - cw / 2 - 12 + colGap * ci, rect.top - 16));
            // Gap overlay
            if (colGap > 0) {
              container.appendChild(createBox(lx, rect.top, colGap, rect.height, 'rgba(156,39,176,0.08)'));
            }
          } else {
            container.appendChild(createPill(Math.round(cw) + 'px', gridColor, rect.left + colOffset - cw / 2 - 12 + colGap * ci, rect.top - 16));
          }
        }
      }
      // Grid rows
      const rows = cs.gridTemplateRows;
      if (rows && rows !== 'none') {
        const rowSizes = rows.split(/\s+/);
        let rowOffset = 0;
        const rowGap = parseFloat(cs.rowGap) || 0;
        for (let ri = 0; ri < rowSizes.length; ri++) {
          const rh = parseFloat(rowSizes[ri]);
          if (isNaN(rh)) continue;
          rowOffset += rh;
          if (ri < rowSizes.length - 1) {
            const ly = rect.top + rowOffset + rowGap * ri;
            container.appendChild(createLine(rect.left, ly, rect.right, ly, gridColor, true));
            // Gap overlay
            if (rowGap > 0) {
              container.appendChild(createBox(rect.left, ly, rect.width, rowGap, 'rgba(156,39,176,0.08)'));
            }
          }
        }
      }
    } else if (display === 'flex' || display === 'inline-flex') {
      // Flex axis arrow
      const dir = cs.flexDirection || 'row';
      const arrowColor = gridColor;
      let ax: number, ay: number, bx: number, by: number;
      const margin = 6;
      if (dir === 'row' || dir === 'row-reverse') {
        ay = by = rect.top + rect.height / 2;
        if (dir === 'row') { ax = rect.left + margin; bx = rect.right - margin; }
        else { ax = rect.right - margin; bx = rect.left + margin; }
      } else {
        ax = bx = rect.left + rect.width / 2;
        if (dir === 'column') { ay = rect.top + margin; by = rect.bottom - margin; }
        else { ay = rect.bottom - margin; by = rect.top + margin; }
      }
      container.appendChild(createLine(ax!, ay!, bx!, by!, arrowColor, true));
      // Arrowhead
      const arrowHead = document.createElement('div');
      arrowHead.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;width:0;height:0;';
      if (dir === 'row') {
        arrowHead.style.left = (bx! - 6) + 'px'; arrowHead.style.top = (by! - 4) + 'px';
        arrowHead.style.borderTop = '4px solid transparent'; arrowHead.style.borderBottom = '4px solid transparent';
        arrowHead.style.borderLeft = '6px solid ' + arrowColor;
      } else if (dir === 'row-reverse') {
        arrowHead.style.left = bx! + 'px'; arrowHead.style.top = (by! - 4) + 'px';
        arrowHead.style.borderTop = '4px solid transparent'; arrowHead.style.borderBottom = '4px solid transparent';
        arrowHead.style.borderRight = '6px solid ' + arrowColor;
      } else if (dir === 'column') {
        arrowHead.style.left = (bx! - 4) + 'px'; arrowHead.style.top = (by! - 6) + 'px';
        arrowHead.style.borderLeft = '4px solid transparent'; arrowHead.style.borderRight = '4px solid transparent';
        arrowHead.style.borderTop = '6px solid ' + arrowColor;
      } else {
        arrowHead.style.left = (bx! - 4) + 'px'; arrowHead.style.top = by! + 'px';
        arrowHead.style.borderLeft = '4px solid transparent'; arrowHead.style.borderRight = '4px solid transparent';
        arrowHead.style.borderBottom = '6px solid ' + arrowColor;
      }
      container.appendChild(arrowHead);
      // Show gaps between flex children
      showAutoLayoutGaps(container, element);
    }
  }

  // Main measure update — called on hover/click in measure mode
  function updateMeasureOverlay(hoveredEl: HTMLElement): void {
    clearMeasureOverlay();
    if (!measureMode) return;
    const container = ensureMeasureContainer();
    if (!hoveredEl || hoveredEl === document.body || hoveredEl === document.documentElement) return;

    const hovRect = hoveredEl.getBoundingClientRect();
    showElementDimensions(container, hovRect);

    if (selectedElement && selectedElement !== hoveredEl) {
      const selRect = selectedElement.getBoundingClientRect();
      showDistanceGuides(container, selRect, hovRect);
    }

    if (selectedElement && selectedElement === hoveredEl) {
      showParentRelativeDistances(container, hoveredEl);
    }

    showPaddingOverlay(container, hoveredEl);
    showAutoLayoutGaps(container, hoveredEl);
  }

  function updateMeasureForSelection(element: HTMLElement): void {
    clearMeasureOverlay();
    if (!measureMode || !element) return;
    const container = ensureMeasureContainer();
    const rect = element.getBoundingClientRect();
    showElementDimensions(container, rect);
    showParentRelativeDistances(container, element);
    showPaddingOverlay(container, element);
    showLayoutOverlay(container, element);
  }
  // ─── End Measurement Helpers ───

  function createOverlay(): void {
    if (document.getElementById('inspector-overlay')) return;
    overlay = document.createElement('div');
    overlay.id = 'inspector-overlay';
    overlay.style.position = 'fixed';
    overlay.style.border = '1px solid #2196F3';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.zIndex = '999999';
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }

  function createSelectionOverlay(): void {
    if (document.getElementById('inspector-selection')) return;
    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'inspector-selection';
    selectionOverlay.style.position = 'fixed';
    selectionOverlay.style.border = '2px solid #2196F3';
    selectionOverlay.style.backgroundColor = 'transparent';
    selectionOverlay.style.zIndex = '999998';
    selectionOverlay.style.pointerEvents = 'none';
    selectionOverlay.style.display = 'none';
    document.body.appendChild(selectionOverlay);

    // Add a label to show element info
    const label = document.createElement('div');
    label.id = 'inspector-selection-label';
    label.style.position = 'absolute';
    label.style.top = '-24px';
    label.style.left = '0';
    label.style.background = '#2196F3';
    label.style.color = '#fff';
    label.style.padding = '2px 8px';
    label.style.fontSize = '11px';
    label.style.fontFamily = 'monospace';
    label.style.fontWeight = 'bold';
    label.style.borderRadius = '4px 4px 0 0';
    label.style.whiteSpace = 'nowrap';
    selectionOverlay.appendChild(label);
  }

  function showSelectionOverlay(element: HTMLElement): void {
    createSelectionOverlay();
    selectedElement = element;
    selectedElementId = __getElementId(element);
    const sel = document.getElementById('inspector-selection');
    const label = document.getElementById('inspector-selection-label');
    if (!sel) return;

    const rect = element.getBoundingClientRect();
    sel.style.top = rect.top + 'px';
    sel.style.left = rect.left + 'px';
    sel.style.width = rect.width + 'px';
    sel.style.height = rect.height + 'px';
    sel.style.display = 'block';

    // Update label
    if (label) {
      const tagName = element.tagName.toLowerCase();
      const classes = element.className ? '.' + element.className.split(' ').slice(0, 2).join('.') : '';
      label.textContent = '<' + tagName + '>' + classes;
    }

    // Start observing element for size/content changes
    startObserving(element);
  }

  let resizeObserver: ResizeObserver | null = null;
  let selectedElementId: string | null = null;
  let domObserver: MutationObserver | null = null;

  function hideSelectionOverlay(): void {
    const sel = document.getElementById('inspector-selection');
    if (sel) sel.style.display = 'none';
    stopObserving();
    selectedElement = null;
    selectedElementId = null;
  }

  // Update selection position on scroll/resize/element changes
  function updateSelectionPosition(): void {
    if (!selectedElement) return;
    const sel = document.getElementById('inspector-selection');
    if (!sel || sel.style.display === 'none') return;

    // Check if element is still in DOM, if not try to re-find by ID
    if (!document.body.contains(selectedElement) && selectedElementId) {
      const newElement = __findElementById(selectedElementId) as HTMLElement | null;
      if (newElement) {
        selectedElement = newElement;
        startObserving(newElement);
      } else {
        return; // Element gone, wait for it to reappear
      }
    }

    const rect = selectedElement.getBoundingClientRect();
    sel.style.top = rect.top + 'px';
    sel.style.left = rect.left + 'px';
    sel.style.width = rect.width + 'px';
    sel.style.height = rect.height + 'px';
  }

  function startObserving(element: HTMLElement): void {
    // Stop previous element observer
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    // Watch for size changes on the element
    resizeObserver = new ResizeObserver(() => {
      updateSelectionPosition();
    });
    resizeObserver.observe(element);

    // Start DOM observer if not already running
    if (!domObserver) {
      domObserver = new MutationObserver(() => {
        // Debounce updates
        requestAnimationFrame(updateSelectionPosition);
      });
      domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  function stopObserving(): void {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
  }

  window.addEventListener('scroll', updateSelectionPosition, true);
  window.addEventListener('resize', updateSelectionPosition);

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.data.type === 'TOGGLE_INSPECTOR') {
      active = event.data.enabled;
      createOverlay();
      if (!active) {
        // Inspector turned off - hide hover overlay and selection
        if (overlay) overlay.style.display = 'none';
        hideSelectionOverlay();
        if (!measureMode) clearMeasureOverlay();
      }
    }

    if (event.data.type === 'TOGGLE_MEASURE') {
      measureMode = event.data.enabled;
      if (!measureMode) {
        clearMeasureOverlay();
      } else {
        // If there's a selected element, show its layout overlay
        if (selectedElement) updateMeasureForSelection(selectedElement);
      }
    }

    if (event.data.type === 'CLEAR_SELECTION') {
      hideSelectionOverlay();
      clearMeasureOverlay();
    }

    if (event.data.type === 'RELOAD_REQ') {
       window.location.reload();
    }

    if (event.data.type === 'RELOAD_TRANSLATIONS') {
      console.log('[adorable] RELOAD_TRANSLATIONS received');
      let reloaded = false;
      // The host passes the new translation content directly in the message,
      // so we can use setTranslation() instead of reloadLang() to avoid HTTP caching.
      const translationContent = event.data.content || null;
      let parsedTranslations: any = null;
      if (translationContent) {
        try { parsedTranslations = JSON.parse(translationContent); } catch (e) {}
      }
      try {
        const ng = window.ng;

        // Force change detection on all root Angular components.
        function forceChangeDetection(): void {
          if (!window.ng) return;
          try {
            const seen = new WeakSet();
            function forceCD(el: Element): void {
              try {
                const c = ng!.getComponent(el);
                if (c && !seen.has(c)) { seen.add(c); ng!.applyChanges(c); }
              } catch (e) {}
            }
            document.querySelectorAll('[ng-version]').forEach(forceCD);
            Array.from(document.body.children).forEach(forceCD);
          } catch (e) {}
        }

        // Duck-type check and invoke a translation service instance.
        function tryReloadService(svc: any): boolean {
          if (!svc || typeof svc !== 'object') return false;
          // Transloco: has getActiveLang() + reloadLang()
          if (typeof svc.reloadLang === 'function' && typeof svc.getActiveLang === 'function') {
            svc.reloadLang(svc.getActiveLang()).subscribe?.();
            return true;
          }
          // ngx-translate: has currentLang string + reloadLang()
          if (typeof svc.reloadLang === 'function' && typeof svc.currentLang === 'string') {
            const lang = svc.currentLang;
            if (parsedTranslations && typeof svc.setTranslation === 'function') {
              // Fast path: inject content directly — no HTTP round-trip, no cache issues.
              // setTranslation fires onTranslationChange which calls markForCheck() on all
              // TranslatePipe instances. use() re-emits onLangChange to trigger CD scheduling.
              svc.setTranslation(lang, parsedTranslations, { shouldMerge: false });
              if (typeof svc.use === 'function') svc.use(lang);
              forceChangeDetection();
            } else {
              // Fallback: re-fetch via HTTP (may hit browser cache).
              svc.reloadLang(lang).subscribe(function () {
                if (typeof svc.use === 'function') svc.use(lang);
                forceChangeDetection();
              });
            }
            return true;
          }
          return false;
        }

        // Scan all DOM elements — check both component properties AND the LView array.
        // When translate pipe is used (not injected directly), the pipe instance lives
        // in the LView (el.__ngContext__) from HEADER_OFFSET (~20) onwards.
        // The pipe instance has the TranslateService/TranslocoService as a property.
        const allEls = Array.from(document.querySelectorAll('*'));
        const checkedInstances = new WeakSet();

        function scanInstance(inst: any): boolean {
          if (!inst || typeof inst !== 'object' || checkedInstances.has(inst)) return false;
          checkedInstances.add(inst);
          if (tryReloadService(inst)) return true;
          // One level deeper (e.g. pipe instance -> translate service property)
          const props = Object.getOwnPropertyNames(inst);
          for (const p of props) {
            let val: any;
            try { val = inst[p]; } catch { continue; }
            if (tryReloadService(val)) return true;
          }
          return false;
        }

        outer: for (const el of allEls) {
          const ctx = (el as any)['__ngContext__'];
          if (!ctx) continue;
          // Angular 17+: __ngContext__ is LContext {lView, nodeIndex, component}
          // Older Angular: __ngContext__ is the LView array directly
          const lView = Array.isArray(ctx) ? ctx : ctx.lView;
          if (!Array.isArray(lView)) continue;

          // Scan from HEADER_OFFSET (~20) for directive/pipe instances.
          // TranslatePipe instances have a "translate" property = TranslateService.
          for (let i = 20; i < lView.length && i < 200; i++) {
            if (scanInstance(lView[i])) { reloaded = true; break outer; }
          }

          // Also check the component instance directly
          if (ng?.getComponent) {
            let comp: any;
            try { comp = ng.getComponent(el); } catch {}
            if (comp && scanInstance(comp)) { reloaded = true; break outer; }
          }
        }
      } catch (e) {
        console.warn('[adorable] Translation service reload failed:', e);
      }
      console.log('[adorable] RELOAD_TRANSLATIONS done, reloaded:', reloaded);
      if (!reloaded) {
        window.location.reload();
      }
    }

    if (event.data.type === 'SELECT_ELEMENT') {
       // Select an element from breadcrumb navigation
       const { elementId, tagName, index } = event.data;
       let target: HTMLElement | null = null;

       // Try to find by data-elements-id first
       if (elementId) {
          target = __findElementById(elementId) as HTMLElement | null;
       }

       // Fallback: find by walking up from currently selected element
       if (!target && selectedElement && index !== undefined) {
          // Walk up the hierarchy from selected element
          let el: HTMLElement | null = selectedElement;
          const hierarchy: HTMLElement[] = [];
          while (el && el !== document.body && el !== document.documentElement) {
             hierarchy.unshift(el);
             el = el.parentElement;
          }
          // Index is the position in the hierarchy (0 = root, last = current)
          if (index >= 0 && index < hierarchy.length) {
             target = hierarchy[index];
          }
       }

       if (target) {
          selectedElement = target;
          showSelectionOverlay(target);

          // Gather element data and send back
          const computedStyle = window.getComputedStyle(target);
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
                   while (hostEl && (!hostEl.tagName.includes('-'))) {
                      hostEl = hostEl.parentElement;
                   }
                   if (hostEl) hostTag = hostEl.tagName.toLowerCase();
                   break;
                }
                el = el.parentElement;
             }
          }

          // Build new hierarchy from selected element
          const newHierarchy: Array<{ tagName: string; elementId: string | null; text: string; classes: string }> = [];
          let hierEl: HTMLElement | null = target;
          while (hierEl && hierEl !== document.body && hierEl !== document.documentElement) {
             newHierarchy.unshift({
                tagName: hierEl.tagName.toLowerCase(),
                elementId: __getElementId(hierEl),
                text: hierEl.innerText ? hierEl.innerText.substring(0, 20).trim() : '',
                classes: hierEl.className || ''
             });
             hierEl = hierEl.parentElement;
          }

          window.parent.postMessage({
             type: 'ELEMENT_SELECTED',
             payload: {
                tagName: target.tagName.toLowerCase(),
                text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
                componentName: componentName,
                hostTag: hostTag,
                elementId: __getElementId(target),
                ongAnnotation: __getOngAnnotation(target),
                classes: target.className,
                hierarchy: newHierarchy,
                attributes: {
                   id: target.id,
                   type: target.getAttribute('type')
                },
                styles: {
                   color: computedStyle.color,
                   backgroundColor: computedStyle.backgroundColor,
                   fontSize: computedStyle.fontSize,
                   fontWeight: computedStyle.fontWeight,
                   textAlign: computedStyle.textAlign,
                   marginTop: computedStyle.marginTop,
                   marginRight: computedStyle.marginRight,
                   marginBottom: computedStyle.marginBottom,
                   marginLeft: computedStyle.marginLeft,
                   paddingTop: computedStyle.paddingTop,
                   paddingRight: computedStyle.paddingRight,
                   paddingBottom: computedStyle.paddingBottom,
                   paddingLeft: computedStyle.paddingLeft,
                   borderRadius: computedStyle.borderRadius,
                   display: computedStyle.display,
                   flexDirection: computedStyle.flexDirection,
                   justifyContent: computedStyle.justifyContent,
                   alignItems: computedStyle.alignItems,
                   gap: computedStyle.gap
                }
             }
          }, '*');
       }
    }
  });

  // Inspector Events
  document.addEventListener('mouseover', (e: MouseEvent) => {
    if (!active && !measureMode) return;
    const target = e.target as HTMLElement;
    // Skip measure overlay elements
    if (target.closest && target.closest('#__measure-overlay')) return;
    const overlayEl = document.getElementById('inspector-overlay');
    if (!overlayEl || target === overlayEl || target === document.body || target === document.documentElement) return;

    const rect = target.getBoundingClientRect();
    overlayEl.style.top = rect.top + 'px';
    overlayEl.style.left = rect.left + 'px';
    overlayEl.style.width = rect.width + 'px';
    overlayEl.style.height = rect.height + 'px';
    overlayEl.style.display = 'block';

    if (measureMode) updateMeasureOverlay(target);
  });

  // Hide inspector hover overlay when mouse leaves the preview window
  document.addEventListener('mouseleave', () => {
    const overlayEl = document.getElementById('inspector-overlay');
    if (overlayEl) overlayEl.style.display = 'none';
    if (measureMode) clearMeasureOverlay();
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();

    // Delay click processing to allow double-click to cancel it
    pendingClickEvent = e;
    if (clickTimeout) clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
      if (!pendingClickEvent) return; // Was cancelled by dblclick
      processClick(pendingClickEvent);
      pendingClickEvent = null;
    }, 250);
  }, true); // capture phase — intercepts before Angular router/button handlers fire

  function processClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    let componentName: string | null = null;
    let hostTag: string | null = null;

    // Attempt to find Angular Component and its Host Tag
    if (window.ng) {
       let el: Element | null = target;
       while (el) {
          let comp = window.ng.getComponent(el);
          if (!comp) comp = window.ng.getOwningComponent(el);

          if (comp && comp.constructor) {
             componentName = comp.constructor.name;
             // Strip leading underscores (common in build artifacts)
             if (componentName!.startsWith('_')) {
                componentName = componentName!.substring(1);
             }

             // If we found the component, the element itself or its nearest custom parent is the host
             let hostEl: Element | null = el;
             while (hostEl && (!hostEl.tagName.includes('-'))) {
                hostEl = hostEl.parentElement;
             }
             if (hostEl) hostTag = hostEl.tagName.toLowerCase();

             break;
          }
          el = el.parentElement;
       }
    }

    // Fallback: Find nearest custom element (tag with dash)
    if (!componentName) {
       let el: Element | null = target;
       while (el && el.tagName) {
          if (el.tagName.includes('-')) {
             hostTag = el.tagName.toLowerCase();
             break;
          }
          el = el.parentElement;
       }

       if (!hostTag) {
          console.warn('[Inspector] Failed to find component or host tag for', target);
          if (document.querySelector('app-root')) {
             componentName = 'AppComponent';
             hostTag = 'app-root';
          }
       }
    }

    const computedStyle = window.getComputedStyle(target);

    // Capture data-elements-id for reliable visual editing
    const elementId = __getElementId(target);

    // Calculate child index among siblings of same tag
    let childIndex = 0;
    if (target.parentNode) {
       const siblings = Array.from(target.parentNode.children);
       const sameTagSiblings = siblings.filter(s => s.tagName === target.tagName);
       childIndex = sameTagSiblings.indexOf(target);
    }

    // Build element hierarchy for breadcrumb navigation
    const hierarchy: Array<{ tagName: string; elementId: string | null; text: string; classes: string }> = [];
    let el: HTMLElement | null = target;
    while (el && el !== document.body && el !== document.documentElement) {
       hierarchy.unshift({
          tagName: el.tagName.toLowerCase(),
          elementId: __getElementId(el),
          text: el.innerText ? el.innerText.substring(0, 20).trim() : '',
          classes: el.className || ''
       });
       el = el.parentElement;
    }

    // Show persistent selection overlay
    showSelectionOverlay(target);

    // Update measure overlay for newly selected element
    if (measureMode) updateMeasureForSelection(target);

    window.parent.postMessage({
      type: 'ELEMENT_SELECTED',
      payload: {
        tagName: target.tagName.toLowerCase(),
        text: target.innerText ? target.innerText.substring(0, 100).trim() : '',
        componentName: componentName,
        hostTag: hostTag,
        elementId: elementId,
        ongAnnotation: __getOngAnnotation(target),
        childIndex: childIndex,
        parentTag: target.parentNode ? (target.parentNode as HTMLElement).tagName.toLowerCase() : null,
        classes: target.className,
        hierarchy: hierarchy,
        attributes: {
           id: target.id,
           type: target.getAttribute('type')
        },
        styles: {
            // Colors
            color: computedStyle.color,
            backgroundColor: computedStyle.backgroundColor,
            // Typography
            fontSize: computedStyle.fontSize,
            fontWeight: computedStyle.fontWeight,
            textAlign: computedStyle.textAlign,
            lineHeight: computedStyle.lineHeight,
            // Spacing
            padding: computedStyle.padding,
            paddingTop: computedStyle.paddingTop,
            paddingRight: computedStyle.paddingRight,
            paddingBottom: computedStyle.paddingBottom,
            paddingLeft: computedStyle.paddingLeft,
            margin: computedStyle.margin,
            marginTop: computedStyle.marginTop,
            marginRight: computedStyle.marginRight,
            marginBottom: computedStyle.marginBottom,
            marginLeft: computedStyle.marginLeft,
            // Border
            borderRadius: computedStyle.borderRadius,
            borderWidth: computedStyle.borderWidth,
            borderColor: computedStyle.borderColor,
            borderStyle: computedStyle.borderStyle,
            // Layout (for containers)
            display: computedStyle.display,
            flexDirection: computedStyle.flexDirection,
            justifyContent: computedStyle.justifyContent,
            alignItems: computedStyle.alignItems,
            gap: computedStyle.gap,
            flexWrap: computedStyle.flexWrap
        }
      }
    }, '*');

    // Keep inspector active - don't set active = false
    // User can toggle it off with the inspect button
  }

  // In-place text editing (double-click)
  document.addEventListener('dblclick', (e: MouseEvent) => {
    // Cancel the pending single-click
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    pendingClickEvent = null;

    if (!active) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    const text = target.textContent?.trim();

    // Only allow on text-containing elements without child elements
    if (!text || target.children.length > 0) return;

    // Store original text for cancel
    const originalText = target.textContent!;
    const elementId = __getElementId(target);

    // Build fingerprint for the element
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
             while (hostEl && (!hostEl.tagName.includes('-'))) hostEl = hostEl.parentElement;
             if (hostEl) hostTag = hostEl.tagName.toLowerCase();
             break;
          }
          el = el.parentElement;
       }
    }

    // Make editable
    target.setAttribute('contenteditable', 'true');
    target.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(target);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    // Style to show editing mode
    target.style.outline = '2px solid #3ecf8e';
    target.style.outlineOffset = '2px';
    target.style.borderRadius = '2px';

    // Save function
    const save = () => {
      target.removeAttribute('contenteditable');
      target.style.outline = '';
      target.style.outlineOffset = '';
      target.style.borderRadius = '';

      const newText = target.textContent?.trim();
      if (newText && newText !== originalText.trim()) {
        window.parent.postMessage({
          type: 'INLINE_TEXT_EDIT',
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: originalText,
            newText: newText,
            elementId: elementId,
            ongAnnotation: __getOngAnnotation(target),
            componentName: componentName,
            hostTag: hostTag,
            classes: target.className,
            attributes: { id: target.id }
          }
        }, '*');
      }
    };

    target.addEventListener('blur', save, { once: true });
    target.addEventListener('keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        target.blur();
      }
      if (evt.key === 'Escape') {
        target.textContent = originalText;
        target.blur();
      }
    });

    // Hide overlay during editing
    const overlayEl = document.getElementById('inspector-overlay');
    if (overlayEl) overlayEl.style.display = 'none';
  }, true); // capture phase
})();
