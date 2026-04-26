// AUTO-GENERATED — do not edit manually.
// Source: libs/shared-types/src/lib/runtime-scripts/*.ts
// Build:  npx tsx libs/shared-types/scripts/build-runtime-scripts.ts

export const RUNTIME_SCRIPTS = `
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script>
    // --- storage-settings ---
    (function() {
      const agentUrl = "http://localhost:" + (window.__adorable_agent_port || "3334");
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", agentUrl + "/api/native/storage-settings", false);
        xhr.send();
        if (xhr.status === 200) {
          const settings = JSON.parse(xhr.responseText);
          if (settings.localStorage) {
            Object.keys(settings.localStorage).forEach(function(key) {
              localStorage.setItem(key, settings.localStorage[key]);
            });
          }
          if (settings.cookies) {
            Object.keys(settings.cookies).forEach(function(key) {
              document.cookie = key + "=" + encodeURIComponent(settings.cookies[key]) + "; path=/";
            });
          }
        }
      } catch (e) {
      }
    })();

    // --- console-interceptor ---
    (function() {
      if (window.parent === window) return;
      const originalLog = console.log;
      const originalWarn = console.warn;
      const originalError = console.error;
      function send(type, args) {
        const message = args.map((arg) => {
          try {
            return typeof arg === "object" ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(" ");
        window.parent.postMessage({ type: "PREVIEW_CONSOLE", level: type, message }, "*");
      }
      console.log = function(...args) {
        originalLog.apply(console, args);
        send("log", args);
      };
      console.warn = function(...args) {
        originalWarn.apply(console, args);
        send("warn", args);
      };
      console.error = function(...args) {
        originalError.apply(console, args);
        send("error", args);
      };
    })();

    // --- route-tracker ---
    (function() {
      let lastPath = "";
      function reportRoute() {
        const p = location.pathname + location.hash;
        if (p !== lastPath) {
          lastPath = p;
          const msg = { type: "PREVIEW_ROUTE_CHANGE", route: p };
          window.parent.postMessage(msg, "*");
        }
      }
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function(...args) {
        origPush.apply(this, args);
        reportRoute();
      };
      history.replaceState = function(...args) {
        origReplace.apply(this, args);
        reportRoute();
      };
      window.addEventListener("popstate", reportRoute);
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", reportRoute);
      } else {
        reportRoute();
      }
    })();

    // --- element-helpers ---
    function __getElementId(el) {
      const ongId = el.getAttribute("_ong");
      if (ongId) return "_ong:" + ongId;
      return el.getAttribute("data-elements-id") || null;
    }
    function __getOngAnnotation(el) {
      const ongId = el.getAttribute("_ong");
      if (ongId && window.__ong_annotations) return window.__ong_annotations[ongId] || null;
      return null;
    }
    function __findElementById(id) {
      if (!id) return null;
      if (id.startsWith("_ong:")) {
        return document.querySelector('[_ong="' + id.slice(5) + '"]');
      }
      return document.querySelector('[data-elements-id="' + id + '"]');
    }

    // --- inspector ---
    (function() {
      let active = false;
      let measureMode = false;
      let optionHeld = false;
      let lastHoveredElement = null;
      let figmaCompareMode = false;
      let overlay = null;
      let selectionOverlay = null;
      let selectedElement = null;
      let clickTimeout = null;
      let pendingClickEvent = null;
      function isMeasuring() {
        return measureMode || optionHeld;
      }
      let measureContainer = null;
      function ensureMeasureContainer() {
        const existing = document.getElementById("__measure-overlay");
        if (existing) return existing;
        measureContainer = document.createElement("div");
        measureContainer.id = "__measure-overlay";
        measureContainer.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999997;";
        document.body.appendChild(measureContainer);
        return measureContainer;
      }
      function clearMeasureOverlay() {
        const c = document.getElementById("__measure-overlay");
        if (c) c.innerHTML = "";
      }
      function createPill(text, color, x, y) {
        const pill = document.createElement("div");
        pill.style.cssText = "position:fixed;padding:1px 5px;border-radius:3px;font-size:10px;font-family:system-ui,sans-serif;font-weight:600;white-space:nowrap;pointer-events:none;line-height:14px;z-index:999999;";
        pill.style.background = color;
        pill.style.color = "#fff";
        pill.style.left = x + "px";
        pill.style.top = y + "px";
        pill.textContent = text;
        return pill;
      }
      function createLine(x1, y1, x2, y2, color, dashed) {
        const line = document.createElement("div");
        const isVert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
        if (isVert) {
          const top = Math.min(y1, y2);
          const h = Math.abs(y2 - y1);
          line.style.cssText = "position:fixed;pointer-events:none;z-index:999998;";
          line.style.left = x1 + "px";
          line.style.top = top + "px";
          line.style.width = "1px";
          line.style.height = h + "px";
          line.style.background = color;
          if (dashed) {
            line.style.background = "none";
            line.style.borderLeft = "1px dashed " + color;
          }
        } else {
          const left = Math.min(x1, x2);
          const w = Math.abs(x2 - x1);
          line.style.cssText = "position:fixed;pointer-events:none;z-index:999998;";
          line.style.left = left + "px";
          line.style.top = y1 + "px";
          line.style.width = w + "px";
          line.style.height = "1px";
          line.style.background = color;
          if (dashed) {
            line.style.background = "none";
            line.style.borderTop = "1px dashed " + color;
          }
        }
        return line;
      }
      function createCap(x, y, isVertical, color) {
        const cap = document.createElement("div");
        cap.style.cssText = "position:fixed;pointer-events:none;z-index:999998;background:" + color + ";";
        if (isVertical) {
          cap.style.left = x - 3 + "px";
          cap.style.top = y + "px";
          cap.style.width = "7px";
          cap.style.height = "1px";
        } else {
          cap.style.left = x + "px";
          cap.style.top = y - 3 + "px";
          cap.style.width = "1px";
          cap.style.height = "7px";
        }
        return cap;
      }
      function createBox(x, y, w, h, color) {
        const box = document.createElement("div");
        box.style.cssText = "position:fixed;pointer-events:none;z-index:999997;";
        box.style.left = x + "px";
        box.style.top = y + "px";
        box.style.width = w + "px";
        box.style.height = h + "px";
        box.style.background = color;
        return box;
      }
      function showElementDimensions(container, rect) {
        const text = Math.round(rect.width) + " \xD7 " + Math.round(rect.height);
        const pill = createPill(text, "#2196F3", rect.left + rect.width / 2 - 20, rect.bottom + 4);
        container.appendChild(pill);
      }
      function showDistanceGuides(container, selRect, hovRect) {
        const color = "#FF4081";
        const selCenterY = selRect.top + selRect.height / 2;
        const hovCenterY = hovRect.top + hovRect.height / 2;
        const selCenterX = selRect.left + selRect.width / 2;
        const hovCenterX = hovRect.left + hovRect.width / 2;
        if (selRect.bottom <= hovRect.top) {
          const dist = Math.round(hovRect.top - selRect.bottom);
          const x = Math.min(selCenterX, hovCenterX);
          container.appendChild(createLine(x, selRect.bottom, x, hovRect.top, color, false));
          container.appendChild(createCap(x, selRect.bottom, false, color));
          container.appendChild(createCap(x, hovRect.top, false, color));
          if (dist > 0) container.appendChild(createPill(dist + "px", color, x + 4, selRect.bottom + (hovRect.top - selRect.bottom) / 2 - 8));
        } else if (hovRect.bottom <= selRect.top) {
          const dist = Math.round(selRect.top - hovRect.bottom);
          const x = Math.min(selCenterX, hovCenterX);
          container.appendChild(createLine(x, hovRect.bottom, x, selRect.top, color, false));
          container.appendChild(createCap(x, hovRect.bottom, false, color));
          container.appendChild(createCap(x, selRect.top, false, color));
          if (dist > 0) container.appendChild(createPill(dist + "px", color, x + 4, hovRect.bottom + (selRect.top - hovRect.bottom) / 2 - 8));
        }
        if (selRect.right <= hovRect.left) {
          const dist = Math.round(hovRect.left - selRect.right);
          const y = Math.min(selCenterY, hovCenterY);
          container.appendChild(createLine(selRect.right, y, hovRect.left, y, color, false));
          container.appendChild(createCap(selRect.right, y, true, color));
          container.appendChild(createCap(hovRect.left, y, true, color));
          if (dist > 0) container.appendChild(createPill(dist + "px", color, selRect.right + (hovRect.left - selRect.right) / 2 - 12, y - 16));
        } else if (hovRect.right <= selRect.left) {
          const dist = Math.round(selRect.left - hovRect.right);
          const y = Math.min(selCenterY, hovCenterY);
          container.appendChild(createLine(hovRect.right, y, selRect.left, y, color, false));
          container.appendChild(createCap(hovRect.right, y, true, color));
          container.appendChild(createCap(selRect.left, y, true, color));
          if (dist > 0) container.appendChild(createPill(dist + "px", color, hovRect.right + (selRect.left - hovRect.right) / 2 - 12, y - 16));
        }
      }
      function showParentRelativeDistances(container, element) {
        const parent = element.offsetParent || element.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) return;
        const eRect = element.getBoundingClientRect();
        const pRect = parent.getBoundingClientRect();
        const color = "#FF9800";
        const distTop = Math.round(eRect.top - pRect.top);
        const distBottom = Math.round(pRect.bottom - eRect.bottom);
        const distLeft = Math.round(eRect.left - pRect.left);
        const distRight = Math.round(pRect.right - eRect.right);
        const cx = eRect.left + eRect.width / 2;
        const cy = eRect.top + eRect.height / 2;
        if (distTop > 0) {
          container.appendChild(createLine(cx, pRect.top, cx, eRect.top, color, true));
          container.appendChild(createPill(distTop + "px", color, cx + 4, pRect.top + distTop / 2 - 8));
        }
        if (distBottom > 0) {
          container.appendChild(createLine(cx, eRect.bottom, cx, pRect.bottom, color, true));
          container.appendChild(createPill(distBottom + "px", color, cx + 4, eRect.bottom + distBottom / 2 - 8));
        }
        if (distLeft > 0) {
          container.appendChild(createLine(pRect.left, cy, eRect.left, cy, color, true));
          container.appendChild(createPill(distLeft + "px", color, pRect.left + distLeft / 2 - 12, cy - 16));
        }
        if (distRight > 0) {
          container.appendChild(createLine(eRect.right, cy, pRect.right, cy, color, true));
          container.appendChild(createPill(distRight + "px", color, eRect.right + distRight / 2 - 12, cy - 16));
        }
      }
      function showPaddingOverlay(container, element) {
        const cs = window.getComputedStyle(element);
        const pTop = parseFloat(cs.paddingTop) || 0;
        const pRight = parseFloat(cs.paddingRight) || 0;
        const pBottom = parseFloat(cs.paddingBottom) || 0;
        const pLeft = parseFloat(cs.paddingLeft) || 0;
        if (pTop + pRight + pBottom + pLeft === 0) return;
        const rect = element.getBoundingClientRect();
        const padColor = "rgba(76,175,80,0.15)";
        if (pTop > 0) {
          container.appendChild(createBox(rect.left, rect.top, rect.width, pTop, padColor));
          if (pTop >= 8) container.appendChild(createPill(Math.round(pTop) + "", "#4CAF50", rect.left + rect.width / 2 - 8, rect.top + pTop / 2 - 7));
        }
        if (pBottom > 0) {
          container.appendChild(createBox(rect.left, rect.bottom - pBottom, rect.width, pBottom, padColor));
          if (pBottom >= 8) container.appendChild(createPill(Math.round(pBottom) + "", "#4CAF50", rect.left + rect.width / 2 - 8, rect.bottom - pBottom / 2 - 7));
        }
        if (pLeft > 0) {
          container.appendChild(createBox(rect.left, rect.top + pTop, pLeft, rect.height - pTop - pBottom, padColor));
          if (pLeft >= 12) container.appendChild(createPill(Math.round(pLeft) + "", "#4CAF50", rect.left + pLeft / 2 - 6, rect.top + rect.height / 2 - 7));
        }
        if (pRight > 0) {
          container.appendChild(createBox(rect.right - pRight, rect.top + pTop, pRight, rect.height - pTop - pBottom, padColor));
          if (pRight >= 12) container.appendChild(createPill(Math.round(pRight) + "", "#4CAF50", rect.right - pRight / 2 - 6, rect.top + rect.height / 2 - 7));
        }
      }
      function showAutoLayoutGaps(container, element) {
        const cs = window.getComputedStyle(element);
        const display = cs.display;
        if (display !== "flex" && display !== "inline-flex" && display !== "grid" && display !== "inline-grid") return;
        const children = Array.from(element.children).filter(function(c) {
          const s = window.getComputedStyle(c);
          return s.display !== "none" && s.position !== "absolute" && s.position !== "fixed";
        });
        if (children.length < 2) return;
        const gapColor = "rgba(255,64,129,0.12)";
        const labelColor = "#FF4081";
        const isRow = display.includes("grid") || cs.flexDirection === "row" || cs.flexDirection === "row-reverse";
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
              if (gapW >= 4) container.appendChild(createPill(Math.round(gapW) + "px", labelColor, gapLeft + gapW / 2 - 10, gapTop + gapH / 2 - 8));
            }
          } else {
            const gapTop2 = Math.min(r1.bottom, r2.bottom);
            const gapBottom2 = Math.max(r1.top, r2.top);
            if (gapBottom2 > gapTop2) {
              const gapH2 = gapBottom2 - gapTop2;
              const gapLeft2 = Math.min(r1.left, r2.left);
              const gapW2 = Math.max(r1.right, r2.right) - gapLeft2;
              container.appendChild(createBox(gapLeft2, gapTop2, gapW2, gapH2, gapColor));
              if (gapH2 >= 4) container.appendChild(createPill(Math.round(gapH2) + "px", labelColor, gapLeft2 + gapW2 / 2 - 10, gapTop2 + gapH2 / 2 - 8));
            }
          }
        }
      }
      function showLayoutOverlay(container, element) {
        const cs = window.getComputedStyle(element);
        const display = cs.display;
        const rect = element.getBoundingClientRect();
        const gridColor = "#9C27B0";
        if (display === "grid" || display === "inline-grid") {
          const cols = cs.gridTemplateColumns;
          if (cols && cols !== "none") {
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
                container.appendChild(createPill(Math.round(cw) + "px", gridColor, rect.left + colOffset - cw / 2 - 12 + colGap * ci, rect.top - 16));
                if (colGap > 0) {
                  container.appendChild(createBox(lx, rect.top, colGap, rect.height, "rgba(156,39,176,0.08)"));
                }
              } else {
                container.appendChild(createPill(Math.round(cw) + "px", gridColor, rect.left + colOffset - cw / 2 - 12 + colGap * ci, rect.top - 16));
              }
            }
          }
          const rows = cs.gridTemplateRows;
          if (rows && rows !== "none") {
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
                if (rowGap > 0) {
                  container.appendChild(createBox(rect.left, ly, rect.width, rowGap, "rgba(156,39,176,0.08)"));
                }
              }
            }
          }
        } else if (display === "flex" || display === "inline-flex") {
          const dir = cs.flexDirection || "row";
          const arrowColor = gridColor;
          let ax, ay, bx, by;
          const margin = 6;
          if (dir === "row" || dir === "row-reverse") {
            ay = by = rect.top + rect.height / 2;
            if (dir === "row") {
              ax = rect.left + margin;
              bx = rect.right - margin;
            } else {
              ax = rect.right - margin;
              bx = rect.left + margin;
            }
          } else {
            ax = bx = rect.left + rect.width / 2;
            if (dir === "column") {
              ay = rect.top + margin;
              by = rect.bottom - margin;
            } else {
              ay = rect.bottom - margin;
              by = rect.top + margin;
            }
          }
          container.appendChild(createLine(ax, ay, bx, by, arrowColor, true));
          const arrowHead = document.createElement("div");
          arrowHead.style.cssText = "position:fixed;pointer-events:none;z-index:999998;width:0;height:0;";
          if (dir === "row") {
            arrowHead.style.left = bx - 6 + "px";
            arrowHead.style.top = by - 4 + "px";
            arrowHead.style.borderTop = "4px solid transparent";
            arrowHead.style.borderBottom = "4px solid transparent";
            arrowHead.style.borderLeft = "6px solid " + arrowColor;
          } else if (dir === "row-reverse") {
            arrowHead.style.left = bx + "px";
            arrowHead.style.top = by - 4 + "px";
            arrowHead.style.borderTop = "4px solid transparent";
            arrowHead.style.borderBottom = "4px solid transparent";
            arrowHead.style.borderRight = "6px solid " + arrowColor;
          } else if (dir === "column") {
            arrowHead.style.left = bx - 4 + "px";
            arrowHead.style.top = by - 6 + "px";
            arrowHead.style.borderLeft = "4px solid transparent";
            arrowHead.style.borderRight = "4px solid transparent";
            arrowHead.style.borderTop = "6px solid " + arrowColor;
          } else {
            arrowHead.style.left = bx - 4 + "px";
            arrowHead.style.top = by + "px";
            arrowHead.style.borderLeft = "4px solid transparent";
            arrowHead.style.borderRight = "4px solid transparent";
            arrowHead.style.borderBottom = "6px solid " + arrowColor;
          }
          container.appendChild(arrowHead);
          showAutoLayoutGaps(container, element);
        }
      }
      function updateMeasureOverlay(hoveredEl) {
        clearMeasureOverlay();
        if (!isMeasuring()) return;
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
      function updateMeasureForSelection(element) {
        clearMeasureOverlay();
        if (!isMeasuring() || !element) return;
        const container = ensureMeasureContainer();
        const rect = element.getBoundingClientRect();
        showElementDimensions(container, rect);
        showParentRelativeDistances(container, element);
        showPaddingOverlay(container, element);
        showLayoutOverlay(container, element);
        if (element.getAttribute("data-figma-node")) {
          pendingCompareElement = element;
          requestFigmaComparison(element);
        }
      }
      const COMPARE_TOLERANCE = 2;
      function snapToFigmaNode(element) {
        let el = element;
        while (el && el !== document.body) {
          if (el.getAttribute("data-figma-node")) return el;
          el = el.parentElement;
        }
        return null;
      }
      function requestFigmaComparison(element) {
        const figmaNodeId = element.getAttribute("data-figma-node");
        if (!figmaNodeId || !isMeasuring()) return;
        const rect = element.getBoundingClientRect();
        const cs = window.getComputedStyle(element);
        window.parent.postMessage({
          type: "FIGMA_COMPARE_REQUEST",
          figmaNodeId,
          domRect: { width: Math.round(rect.width), height: Math.round(rect.height) },
          domStyles: {
            paddingTop: parseFloat(cs.paddingTop) || 0,
            paddingRight: parseFloat(cs.paddingRight) || 0,
            paddingBottom: parseFloat(cs.paddingBottom) || 0,
            paddingLeft: parseFloat(cs.paddingLeft) || 0,
            borderRadius: parseFloat(cs.borderRadius) || 0,
            gap: parseFloat(cs.gap) || 0
          }
        }, "*");
      }
      function showComparisonOverlay(container, figmaSpecs, domRect, domStyles, element) {
        const rect = element.getBoundingClientRect();
        const comparisons = [];
        if (figmaSpecs.width != null) comparisons.push({ label: "W", dom: domRect.width, figma: figmaSpecs.width });
        if (figmaSpecs.height != null) comparisons.push({ label: "H", dom: domRect.height, figma: figmaSpecs.height });
        if (figmaSpecs.paddingTop != null) comparisons.push({ label: "pt", dom: Math.round(domStyles.paddingTop), figma: figmaSpecs.paddingTop });
        if (figmaSpecs.paddingRight != null) comparisons.push({ label: "pr", dom: Math.round(domStyles.paddingRight), figma: figmaSpecs.paddingRight });
        if (figmaSpecs.paddingBottom != null) comparisons.push({ label: "pb", dom: Math.round(domStyles.paddingBottom), figma: figmaSpecs.paddingBottom });
        if (figmaSpecs.paddingLeft != null) comparisons.push({ label: "pl", dom: Math.round(domStyles.paddingLeft), figma: figmaSpecs.paddingLeft });
        if (figmaSpecs.cornerRadius != null) comparisons.push({ label: "radius", dom: Math.round(domStyles.borderRadius), figma: figmaSpecs.cornerRadius });
        if (figmaSpecs.itemSpacing != null) comparisons.push({ label: "gap", dom: Math.round(domStyles.gap), figma: figmaSpecs.itemSpacing });
        if (comparisons.length === 0) return;
        let matches = 0;
        let mismatches = 0;
        for (const c of comparisons) {
          if (Math.abs(c.dom - c.figma) <= COMPARE_TOLERANCE) matches++;
          else mismatches++;
        }
        const badgeColor = mismatches === 0 ? "#4CAF50" : "#FF5722";
        const badge = createPill(matches + "/" + comparisons.length + " match", badgeColor, rect.right + 4, rect.top - 8);
        container.appendChild(badge);
        const deltas = [];
        let yOffset = rect.top + 10;
        for (const c of comparisons) {
          const delta = c.dom - c.figma;
          if (Math.abs(delta) <= COMPARE_TOLERANCE) continue;
          deltas.push({ label: c.label, dom: c.dom, figma: c.figma, delta });
          const sign = delta > 0 ? "+" : "";
          const text = c.label + ": " + c.dom + "px \u2192 " + c.figma + "px (" + sign + delta + ")";
          const pill = createPill(text, "#FF5722", rect.right + 4, yOffset);
          container.appendChild(pill);
          yOffset += 18;
        }
        if (mismatches > 0) {
          const btn = document.createElement("button");
          btn.style.cssText = "position:fixed;padding:3px 8px;border-radius:3px;font-size:10px;font-family:system-ui,sans-serif;font-weight:600;background:#2196F3;color:#fff;border:none;cursor:pointer;pointer-events:auto;z-index:999999;box-shadow:0 2px 4px rgba(0,0,0,0.2);";
          btn.style.left = rect.right + 4 + "px";
          btn.style.top = yOffset + 4 + "px";
          btn.textContent = "\u2728 Fix with AI";
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const figmaNodeId = element.getAttribute("data-figma-node");
            const ongAnnotation = __getOngAnnotation(element);
            window.parent.postMessage({
              type: "FIGMA_AUTO_FIX_REQUEST",
              figmaNodeId,
              ongAnnotation,
              elementTag: element.tagName.toLowerCase(),
              elementClass: typeof element.className === "string" ? element.className : "",
              deltas
            }, "*");
          });
          container.appendChild(btn);
        }
      }
      let pendingCompareElement = null;
      function createOverlay() {
        if (document.getElementById("inspector-overlay")) return;
        overlay = document.createElement("div");
        overlay.id = "inspector-overlay";
        overlay.style.position = "fixed";
        overlay.style.border = "1px solid #2196F3";
        overlay.style.backgroundColor = "transparent";
        overlay.style.zIndex = "999999";
        overlay.style.pointerEvents = "none";
        overlay.style.display = "none";
        document.body.appendChild(overlay);
      }
      function createSelectionOverlay() {
        if (document.getElementById("inspector-selection")) return;
        selectionOverlay = document.createElement("div");
        selectionOverlay.id = "inspector-selection";
        selectionOverlay.style.position = "fixed";
        selectionOverlay.style.border = "2px solid #2196F3";
        selectionOverlay.style.backgroundColor = "transparent";
        selectionOverlay.style.zIndex = "999998";
        selectionOverlay.style.pointerEvents = "none";
        selectionOverlay.style.display = "none";
        document.body.appendChild(selectionOverlay);
        const label = document.createElement("div");
        label.id = "inspector-selection-label";
        label.style.position = "absolute";
        label.style.top = "-24px";
        label.style.left = "0";
        label.style.background = "#2196F3";
        label.style.color = "#fff";
        label.style.padding = "2px 8px";
        label.style.fontSize = "11px";
        label.style.fontFamily = "monospace";
        label.style.fontWeight = "bold";
        label.style.borderRadius = "4px 4px 0 0";
        label.style.whiteSpace = "nowrap";
        selectionOverlay.appendChild(label);
      }
      function showSelectionOverlay(element) {
        createSelectionOverlay();
        selectedElement = element;
        selectedElementId = __getElementId(element);
        const sel = document.getElementById("inspector-selection");
        const label = document.getElementById("inspector-selection-label");
        if (!sel) return;
        const rect = element.getBoundingClientRect();
        sel.style.top = rect.top + "px";
        sel.style.left = rect.left + "px";
        sel.style.width = rect.width + "px";
        sel.style.height = rect.height + "px";
        sel.style.display = "block";
        if (label) {
          const tagName = element.tagName.toLowerCase();
          const classStr = typeof element.className === "string" ? element.className : element.getAttribute("class") || "";
          const classes = classStr ? "." + classStr.split(" ").slice(0, 2).join(".") : "";
          label.textContent = "<" + tagName + ">" + classes;
        }
        startTrackingLoop();
      }
      let selectedElementId = null;
      let rafHandle = null;
      function hideSelectionOverlay() {
        const sel = document.getElementById("inspector-selection");
        if (sel) sel.style.display = "none";
        stopTrackingLoop();
        selectedElement = null;
        selectedElementId = null;
      }
      function trackSelectionLoop() {
        if (!selectedElement) {
          rafHandle = null;
          return;
        }
        const sel = document.getElementById("inspector-selection");
        if (!sel || sel.style.display === "none") {
          rafHandle = null;
          return;
        }
        if (!document.body.contains(selectedElement) && selectedElementId) {
          const found = __findElementById(selectedElementId);
          if (found) {
            selectedElement = found;
          } else {
            rafHandle = requestAnimationFrame(trackSelectionLoop);
            return;
          }
        }
        const rect = selectedElement.getBoundingClientRect();
        sel.style.top = rect.top + "px";
        sel.style.left = rect.left + "px";
        sel.style.width = rect.width + "px";
        sel.style.height = rect.height + "px";
        rafHandle = requestAnimationFrame(trackSelectionLoop);
      }
      function startTrackingLoop() {
        if (rafHandle !== null) return;
        rafHandle = requestAnimationFrame(trackSelectionLoop);
      }
      function stopTrackingLoop() {
        if (rafHandle !== null) {
          cancelAnimationFrame(rafHandle);
          rafHandle = null;
        }
      }
      window.addEventListener("message", (event) => {
        if (event.data.type === "TOGGLE_INSPECTOR") {
          active = event.data.enabled;
          createOverlay();
          if (!active) {
            if (overlay) overlay.style.display = "none";
            hideSelectionOverlay();
            if (!isMeasuring()) clearMeasureOverlay();
          }
        }
        if (event.data.type === "TOGGLE_MEASURE") {
          measureMode = event.data.enabled;
          if (!measureMode) {
            clearMeasureOverlay();
          } else {
            if (selectedElement) updateMeasureForSelection(selectedElement);
          }
        }
        if (event.data.type === "TOGGLE_FIGMA_COMPARE") {
          figmaCompareMode = event.data.enabled;
        }
        if (event.data.type === "FIGMA_NODES_CHANGED" && isMeasuring() && selectedElement) {
          const changedIds = event.data.changedNodeIds || [];
          const nodeId = selectedElement.getAttribute("data-figma-node");
          if (nodeId && changedIds.includes(nodeId)) {
            pendingCompareElement = selectedElement;
            requestFigmaComparison(selectedElement);
          }
        }
        if (event.data.type === "FIGMA_COMPARE_RESULT") {
          const { figmaNodeId, figmaSpecs, domRect, domStyles } = event.data;
          if (pendingCompareElement && pendingCompareElement.getAttribute("data-figma-node") === figmaNodeId) {
            const container = ensureMeasureContainer();
            showComparisonOverlay(container, figmaSpecs, domRect, domStyles, pendingCompareElement);
          }
        }
        if (event.data.type === "CLEAR_SELECTION") {
          hideSelectionOverlay();
          clearMeasureOverlay();
        }
        if (event.data.type === "RELOAD_REQ") {
          window.location.reload();
        }
        if (event.data.type === "RELOAD_TRANSLATIONS") {
          console.log("[adorable] RELOAD_TRANSLATIONS received");
          let reloaded = false;
          const translationContent = event.data.content || null;
          let parsedTranslations = null;
          if (translationContent) {
            try {
              parsedTranslations = JSON.parse(translationContent);
            } catch (e) {
            }
          }
          try {
            let forceChangeDetection2 = function() {
              if (!window.ng) return;
              try {
                let forceCD2 = function(el) {
                  try {
                    const c = ng.getComponent(el);
                    if (c && !seen.has(c)) {
                      seen.add(c);
                      ng.applyChanges(c);
                    }
                  } catch (e) {
                  }
                };
                var forceCD = forceCD2;
                const seen = /* @__PURE__ */ new WeakSet();
                document.querySelectorAll("[ng-version]").forEach(forceCD2);
                Array.from(document.body.children).forEach(forceCD2);
              } catch (e) {
              }
            }, tryReloadService2 = function(svc) {
              if (!svc || typeof svc !== "object") return false;
              if (typeof svc.reloadLang === "function" && typeof svc.getActiveLang === "function") {
                svc.reloadLang(svc.getActiveLang()).subscribe?.();
                return true;
              }
              if (typeof svc.reloadLang === "function" && typeof svc.currentLang === "string") {
                const lang = svc.currentLang;
                if (parsedTranslations && typeof svc.setTranslation === "function") {
                  svc.setTranslation(lang, parsedTranslations, { shouldMerge: false });
                  if (typeof svc.use === "function") svc.use(lang);
                  forceChangeDetection2();
                } else {
                  svc.reloadLang(lang).subscribe(function() {
                    if (typeof svc.use === "function") svc.use(lang);
                    forceChangeDetection2();
                  });
                }
                return true;
              }
              return false;
            }, scanInstance2 = function(inst) {
              if (!inst || typeof inst !== "object" || checkedInstances.has(inst)) return false;
              checkedInstances.add(inst);
              if (tryReloadService2(inst)) return true;
              const props = Object.getOwnPropertyNames(inst);
              for (const p of props) {
                let val;
                try {
                  val = inst[p];
                } catch {
                  continue;
                }
                if (tryReloadService2(val)) return true;
              }
              return false;
            };
            var forceChangeDetection = forceChangeDetection2, tryReloadService = tryReloadService2, scanInstance = scanInstance2;
            const ng = window.ng;
            const allEls = Array.from(document.querySelectorAll("*"));
            const checkedInstances = /* @__PURE__ */ new WeakSet();
            outer: for (const el of allEls) {
              const ctx = el["__ngContext__"];
              if (!ctx) continue;
              const lView = Array.isArray(ctx) ? ctx : ctx.lView;
              if (!Array.isArray(lView)) continue;
              for (let i = 20; i < lView.length && i < 200; i++) {
                if (scanInstance2(lView[i])) {
                  reloaded = true;
                  break outer;
                }
              }
              if (ng?.getComponent) {
                let comp;
                try {
                  comp = ng.getComponent(el);
                } catch {
                }
                if (comp && scanInstance2(comp)) {
                  reloaded = true;
                  break outer;
                }
              }
            }
          } catch (e) {
            console.warn("[adorable] Translation service reload failed:", e);
          }
          console.log("[adorable] RELOAD_TRANSLATIONS done, reloaded:", reloaded);
          if (!reloaded) {
            window.location.reload();
          }
        }
        if (event.data.type === "SELECT_ELEMENT") {
          const { elementId, tagName, index } = event.data;
          let target = null;
          if (elementId) {
            target = __findElementById(elementId);
          }
          if (!target && selectedElement && index !== void 0) {
            let el = selectedElement;
            const hierarchy = [];
            while (el && el !== document.body && el !== document.documentElement) {
              hierarchy.unshift(el);
              el = el.parentElement;
            }
            if (index >= 0 && index < hierarchy.length) {
              target = hierarchy[index];
            }
          }
          if (target) {
            selectedElement = target;
            showSelectionOverlay(target);
            const computedStyle = window.getComputedStyle(target);
            let componentName = null;
            let hostTag = null;
            if (window.ng) {
              let el = target;
              while (el) {
                let comp = window.ng.getComponent(el);
                if (!comp) comp = window.ng.getOwningComponent(el);
                if (comp && comp.constructor) {
                  componentName = comp.constructor.name;
                  if (componentName.startsWith("_")) componentName = componentName.substring(1);
                  let hostEl = el;
                  while (hostEl && !hostEl.tagName.includes("-")) {
                    hostEl = hostEl.parentElement;
                  }
                  if (hostEl) hostTag = hostEl.tagName.toLowerCase();
                  break;
                }
                el = el.parentElement;
              }
            }
            const newHierarchy = [];
            let hierEl = target;
            while (hierEl && hierEl !== document.body && hierEl !== document.documentElement) {
              newHierarchy.unshift({
                tagName: hierEl.tagName.toLowerCase(),
                elementId: __getElementId(hierEl),
                text: hierEl.innerText ? hierEl.innerText.substring(0, 20).trim() : "",
                classes: hierEl.className || ""
              });
              hierEl = hierEl.parentElement;
            }
            window.parent.postMessage({
              type: "ELEMENT_SELECTED",
              payload: {
                tagName: target.tagName.toLowerCase(),
                text: target.innerText ? target.innerText.substring(0, 100).trim() : "",
                componentName,
                hostTag,
                elementId: __getElementId(target),
                ongAnnotation: __getOngAnnotation(target),
                classes: target.className,
                hierarchy: newHierarchy,
                attributes: {
                  id: target.id,
                  type: target.getAttribute("type")
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
                  flexWrap: computedStyle.flexWrap,
                  justifyContent: computedStyle.justifyContent,
                  alignItems: computedStyle.alignItems,
                  alignContent: computedStyle.alignContent,
                  gap: computedStyle.gap,
                  gridTemplateColumns: computedStyle.gridTemplateColumns,
                  gridTemplateRows: computedStyle.gridTemplateRows,
                  gridAutoFlow: computedStyle.gridAutoFlow,
                  justifyItems: computedStyle.justifyItems
                }
              }
            }, "*");
          }
        }
      });
      document.addEventListener("mouseover", (e) => {
        if (!active && !isMeasuring()) return;
        let target = e.target;
        if (target.closest && target.closest("#__measure-overlay")) return;
        const overlayEl = document.getElementById("inspector-overlay");
        if (!overlayEl || target === overlayEl || target === document.body || target === document.documentElement) return;
        if (figmaCompareMode) {
          const snapped = snapToFigmaNode(target);
          if (!snapped) {
            overlayEl.style.display = "none";
            return;
          }
          target = snapped;
        }
        const rect = target.getBoundingClientRect();
        overlayEl.style.top = rect.top + "px";
        overlayEl.style.left = rect.left + "px";
        overlayEl.style.width = rect.width + "px";
        overlayEl.style.height = rect.height + "px";
        overlayEl.style.display = "block";
        lastHoveredElement = target;
        if (isMeasuring()) updateMeasureOverlay(target);
      });
      document.addEventListener("mouseleave", () => {
        lastHoveredElement = null;
        const overlayEl = document.getElementById("inspector-overlay");
        if (overlayEl) overlayEl.style.display = "none";
        if (isMeasuring()) clearMeasureOverlay();
      });
      document.addEventListener("keydown", (e) => {
        if (!active || e.key !== "Alt") return;
        if (optionHeld) return;
        optionHeld = true;
        if (lastHoveredElement && lastHoveredElement !== selectedElement) {
          updateMeasureOverlay(lastHoveredElement);
        } else if (selectedElement) {
          updateMeasureForSelection(selectedElement);
        }
      });
      document.addEventListener("keyup", (e) => {
        if (e.key !== "Alt") return;
        if (!optionHeld) return;
        optionHeld = false;
        if (!measureMode) clearMeasureOverlay();
      });
      window.addEventListener("blur", () => {
        if (optionHeld) {
          optionHeld = false;
          if (!measureMode) clearMeasureOverlay();
        }
      });
      document.addEventListener("click", (e) => {
        if (!active) return;
        const clickTarget = e.target;
        if (clickTarget && clickTarget.closest && clickTarget.closest("#__measure-overlay")) return;
        e.preventDefault();
        e.stopPropagation();
        pendingClickEvent = e;
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          if (!pendingClickEvent) return;
          processClick(pendingClickEvent);
          pendingClickEvent = null;
        }, 250);
      }, true);
      function processClick(e) {
        let target = e.target;
        if (figmaCompareMode) {
          const snapped = snapToFigmaNode(target);
          if (!snapped) return;
          target = snapped;
        }
        let componentName = null;
        let hostTag = null;
        if (window.ng) {
          let el2 = target;
          while (el2) {
            let comp = window.ng.getComponent(el2);
            if (!comp) comp = window.ng.getOwningComponent(el2);
            if (comp && comp.constructor) {
              componentName = comp.constructor.name;
              if (componentName.startsWith("_")) {
                componentName = componentName.substring(1);
              }
              let hostEl = el2;
              while (hostEl && !hostEl.tagName.includes("-")) {
                hostEl = hostEl.parentElement;
              }
              if (hostEl) hostTag = hostEl.tagName.toLowerCase();
              break;
            }
            el2 = el2.parentElement;
          }
        }
        if (!componentName) {
          let el2 = target;
          while (el2 && el2.tagName) {
            if (el2.tagName.includes("-")) {
              hostTag = el2.tagName.toLowerCase();
              break;
            }
            el2 = el2.parentElement;
          }
          if (!hostTag) {
            console.warn("[Inspector] Failed to find component or host tag for", target);
            if (document.querySelector("app-root")) {
              componentName = "AppComponent";
              hostTag = "app-root";
            }
          }
        }
        const computedStyle = window.getComputedStyle(target);
        const elementId = __getElementId(target);
        let childIndex = 0;
        if (target.parentNode) {
          const siblings = Array.from(target.parentNode.children);
          const sameTagSiblings = siblings.filter((s) => s.tagName === target.tagName);
          childIndex = sameTagSiblings.indexOf(target);
        }
        const hierarchy = [];
        let el = target;
        while (el && el !== document.body && el !== document.documentElement) {
          hierarchy.unshift({
            tagName: el.tagName.toLowerCase(),
            elementId: __getElementId(el),
            text: el.innerText ? el.innerText.substring(0, 20).trim() : "",
            classes: el.className || ""
          });
          el = el.parentElement;
        }
        showSelectionOverlay(target);
        if (isMeasuring()) updateMeasureForSelection(target);
        window.parent.postMessage({
          type: "ELEMENT_SELECTED",
          payload: {
            tagName: target.tagName.toLowerCase(),
            text: target.innerText ? target.innerText.substring(0, 100).trim() : "",
            componentName,
            hostTag,
            elementId,
            ongAnnotation: __getOngAnnotation(target),
            childIndex,
            parentTag: target.parentNode ? target.parentNode.tagName.toLowerCase() : null,
            classes: target.className,
            hierarchy,
            attributes: {
              id: target.id,
              type: target.getAttribute("type")
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
              flexWrap: computedStyle.flexWrap,
              justifyContent: computedStyle.justifyContent,
              alignItems: computedStyle.alignItems,
              alignContent: computedStyle.alignContent,
              gap: computedStyle.gap,
              gridTemplateColumns: computedStyle.gridTemplateColumns,
              gridTemplateRows: computedStyle.gridTemplateRows,
              gridAutoFlow: computedStyle.gridAutoFlow,
              justifyItems: computedStyle.justifyItems
            }
          }
        }, "*");
      }
      document.addEventListener("dblclick", (e) => {
        if (clickTimeout) {
          clearTimeout(clickTimeout);
          clickTimeout = null;
        }
        pendingClickEvent = null;
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.target;
        const text = target.textContent?.trim();
        if (!text || target.children.length > 0) return;
        const originalText = target.textContent;
        const elementId = __getElementId(target);
        let componentName = null;
        let hostTag = null;
        if (window.ng) {
          let el = target;
          while (el) {
            let comp = window.ng.getComponent(el);
            if (!comp) comp = window.ng.getOwningComponent(el);
            if (comp && comp.constructor) {
              componentName = comp.constructor.name;
              if (componentName.startsWith("_")) componentName = componentName.substring(1);
              let hostEl = el;
              while (hostEl && !hostEl.tagName.includes("-")) hostEl = hostEl.parentElement;
              if (hostEl) hostTag = hostEl.tagName.toLowerCase();
              break;
            }
            el = el.parentElement;
          }
        }
        target.setAttribute("contenteditable", "true");
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        target.style.outline = "2px solid #3ecf8e";
        target.style.outlineOffset = "2px";
        target.style.borderRadius = "2px";
        const save = () => {
          target.removeAttribute("contenteditable");
          target.style.outline = "";
          target.style.outlineOffset = "";
          target.style.borderRadius = "";
          const newText = target.textContent?.trim();
          if (newText && newText !== originalText.trim()) {
            window.parent.postMessage({
              type: "INLINE_TEXT_EDIT",
              payload: {
                tagName: target.tagName.toLowerCase(),
                text: originalText,
                newText,
                elementId,
                ongAnnotation: __getOngAnnotation(target),
                componentName,
                hostTag,
                classes: target.className,
                attributes: { id: target.id }
              }
            }, "*");
          }
        };
        target.addEventListener("blur", save, { once: true });
        target.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" && !evt.shiftKey) {
            evt.preventDefault();
            target.blur();
          }
          if (evt.key === "Escape") {
            target.textContent = originalText;
            target.blur();
          }
        });
        const overlayEl = document.getElementById("inspector-overlay");
        if (overlayEl) overlayEl.style.display = "none";
      }, true);
    })();

    // --- multi-annotator ---
    (function() {
      let multiActive = false;
      let nextIndex = 1;
      const items = /* @__PURE__ */ new Map();
      function getElementData(target) {
        let componentName = null;
        let hostTag = null;
        if (window.ng) {
          let el = target;
          while (el) {
            let comp = window.ng.getComponent(el);
            if (!comp) comp = window.ng.getOwningComponent(el);
            if (comp && comp.constructor) {
              componentName = comp.constructor.name;
              if (componentName.startsWith("_")) componentName = componentName.substring(1);
              let hostEl = el;
              while (hostEl && !hostEl.tagName.includes("-")) hostEl = hostEl.parentElement;
              if (hostEl) hostTag = hostEl.tagName.toLowerCase();
              break;
            }
            el = el.parentElement;
          }
        }
        return {
          tagName: target.tagName.toLowerCase(),
          text: target.innerText ? target.innerText.substring(0, 100).trim() : "",
          componentName,
          hostTag,
          elementId: __getElementId(target),
          ongAnnotation: __getOngAnnotation(target),
          classes: target.className || "",
          attributes: { id: target.id, type: target.getAttribute("type") }
        };
      }
      function createBadge(index, element) {
        const badge = document.createElement("div");
        badge.className = "__multi-ann-badge";
        badge.dataset["multiAnnIndex"] = String(index);
        badge.textContent = String(index);
        badge.style.cssText = "position:fixed;z-index:1000000;width:22px;height:22px;border-radius:50%;background:#6366f1;color:#fff;font-size:11px;font-weight:700;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.3);pointer-events:auto;transition:background 0.2s;";
        const tooltip = document.createElement("div");
        tooltip.className = "__multi-ann-tooltip";
        tooltip.textContent = "No note yet";
        tooltip.style.cssText = "position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1e1e2e;color:#cdd6f4;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:400;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;opacity:0;transition:opacity 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
        badge.appendChild(tooltip);
        badge.addEventListener("mouseenter", () => {
          tooltip.style.opacity = "1";
        });
        badge.addEventListener("mouseleave", () => {
          tooltip.style.opacity = "0";
        });
        badge.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({ type: "MULTI_ANNOTATION_CLICKED", index }, "*");
        });
        document.body.appendChild(badge);
        return badge;
      }
      function positionBadge(badge, element) {
        const rect = element.getBoundingClientRect();
        badge.style.top = rect.top - 4 + "px";
        badge.style.left = rect.right - 10 + "px";
      }
      function updateAllBadgePositions() {
        items.forEach((item) => {
          if (!document.body.contains(item.element) && item.elementId) {
            const found = __findElementById(item.elementId);
            if (found) {
              item.element = found;
              item.element.style.outline = "2px dashed #6366f1";
              item.element.style.outlineOffset = "2px";
            }
          }
          if (document.body.contains(item.element)) {
            positionBadge(item.badge, item.element);
          }
        });
      }
      function addElement(target) {
        for (const [, item] of items) {
          if (item.element === target) return;
          if (item.elementId && item.elementId === __getElementId(target)) return;
        }
        const index = nextIndex++;
        const badge = createBadge(index, target);
        positionBadge(badge, target);
        target.style.outline = "2px dashed #6366f1";
        target.style.outlineOffset = "2px";
        const elementId = __getElementId(target);
        items.set(index, { element: target, badge, elementId, note: "" });
        const data = getElementData(target);
        window.parent.postMessage({
          type: "MULTI_ELEMENT_ADDED",
          payload: { ...data, index }
        }, "*");
      }
      function removeItem(index) {
        const item = items.get(index);
        if (!item) return;
        item.badge.remove();
        if (document.body.contains(item.element)) {
          item.element.style.outline = "";
          item.element.style.outlineOffset = "";
        }
        items.delete(index);
      }
      function hideAll() {
        items.forEach((item) => {
          item.badge.style.display = "none";
          if (document.body.contains(item.element)) {
            item.element.style.outline = "";
            item.element.style.outlineOffset = "";
          }
        });
      }
      function showAll() {
        items.forEach((item) => {
          item.badge.style.display = "flex";
          if (document.body.contains(item.element)) {
            item.element.style.outline = "2px dashed #6366f1";
            item.element.style.outlineOffset = "2px";
          }
        });
        updateAllBadgePositions();
      }
      function clearAll() {
        items.forEach((item) => {
          item.badge.remove();
          if (document.body.contains(item.element)) {
            item.element.style.outline = "";
            item.element.style.outlineOffset = "";
          }
        });
        items.clear();
        nextIndex = 1;
      }
      let rafPending = false;
      function schedulePositionUpdate() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          updateAllBadgePositions();
        });
      }
      window.addEventListener("scroll", schedulePositionUpdate, true);
      window.addEventListener("resize", schedulePositionUpdate);
      let multiDomObserver = null;
      function startMultiObserver() {
        if (multiDomObserver) return;
        multiDomObserver = new MutationObserver(schedulePositionUpdate);
        multiDomObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
      }
      function stopMultiObserver() {
        if (multiDomObserver) {
          multiDomObserver.disconnect();
          multiDomObserver = null;
        }
      }
      function onMultiClick(e) {
        if (!multiActive) return;
        e.preventDefault();
        e.stopPropagation();
        const target = e.target;
        if (!target || target === document.body || target === document.documentElement) return;
        if (target.closest && target.closest(".__multi-ann-badge")) return;
        addElement(target);
      }
      let multiHoverOverlay = null;
      function ensureMultiHoverOverlay() {
        if (document.getElementById("__multi-ann-hover")) return;
        multiHoverOverlay = document.createElement("div");
        multiHoverOverlay.id = "__multi-ann-hover";
        multiHoverOverlay.style.cssText = "position:fixed;border:2px solid #6366f1;background:transparent;z-index:999998;pointer-events:none;display:none;border-radius:2px;";
        document.body.appendChild(multiHoverOverlay);
      }
      function onMultiHover(e) {
        if (!multiActive) return;
        const target = e.target;
        if (!multiHoverOverlay || !target || target === document.body || target === document.documentElement) return;
        if (target.closest && target.closest(".__multi-ann-badge")) {
          multiHoverOverlay.style.display = "none";
          return;
        }
        const rect = target.getBoundingClientRect();
        multiHoverOverlay.style.top = rect.top + "px";
        multiHoverOverlay.style.left = rect.left + "px";
        multiHoverOverlay.style.width = rect.width + "px";
        multiHoverOverlay.style.height = rect.height + "px";
        multiHoverOverlay.style.display = "block";
      }
      document.addEventListener("click", onMultiClick, true);
      document.addEventListener("mouseover", onMultiHover);
      document.addEventListener("mouseleave", () => {
        if (multiHoverOverlay) multiHoverOverlay.style.display = "none";
      });
      window.addEventListener("message", (event) => {
        if (event.data.type === "TOGGLE_MULTI_ANNOTATOR") {
          multiActive = event.data.enabled;
          if (multiActive) {
            ensureMultiHoverOverlay();
            startMultiObserver();
            showAll();
          } else {
            if (multiHoverOverlay) multiHoverOverlay.style.display = "none";
            stopMultiObserver();
            hideAll();
          }
        }
        if (event.data.type === "MULTI_ANNOTATE_REMOVE") {
          removeItem(event.data.index);
        }
        if (event.data.type === "MULTI_ANNOTATE_CLEAR") {
          clearAll();
        }
        if (event.data.type === "MULTI_ANNOTATE_UPDATE_NOTE") {
          const item = items.get(event.data.index);
          if (item) {
            item.note = event.data.note || "";
            const badge = item.badge;
            const tooltip = badge.querySelector(".__multi-ann-tooltip");
            if (tooltip) {
              tooltip.textContent = item.note || "No note yet";
            }
            if (item.note) {
              badge.style.background = "#4f46e5";
              badge.style.boxShadow = "0 0 0 2px rgba(99,102,241,0.4), 0 1px 4px rgba(0,0,0,0.3)";
            } else {
              badge.style.background = "#6366f1";
              badge.style.boxShadow = "0 1px 4px rgba(0,0,0,0.3)";
            }
          }
        }
      });
    })();

    // --- screenshot ---
    (function() {
      window.addEventListener("message", async (event) => {
        if (event.data.type === "CAPTURE_REQ") {
          const { x, y, width, height } = event.data.rect;
          try {
            if (!window.html2canvas) {
              console.warn("[Runtime] html2canvas not available");
              window.parent.postMessage({ type: "CAPTURE_RES", image: null }, "*");
              return;
            }
            const canvas = await window.html2canvas(document.body, {
              x,
              y,
              width,
              height,
              scale: 0.5,
              useCORS: true,
              allowTaint: true,
              logging: false
            });
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            window.parent.postMessage({ type: "CAPTURE_RES", image: dataUrl }, "*");
          } catch (err) {
            console.error("[Runtime] Screenshot capture failed:", err);
            window.parent.postMessage({ type: "CAPTURE_RES", image: null }, "*");
          }
        }
      });
    })();
  </script>
`;
