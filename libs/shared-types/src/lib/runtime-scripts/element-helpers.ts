// Element ID helpers — supports both _ong annotations and legacy data-elements-id
// These are global functions (not wrapped in IIFE) used by inspector, multi-annotator, etc.

function __getElementId(el: Element): string | null {
  // Prefer _ong annotation (compile-time, from ong Vite plugin)
  const ongId = el.getAttribute('_ong');
  if (ongId) return '_ong:' + ongId;
  // Fall back to data-elements-id (AI-generated)
  return el.getAttribute('data-elements-id') || null;
}

function __getOngAnnotation(el: Element): any | null {
  const ongId = el.getAttribute('_ong');
  if (ongId && (window as any).__ong_annotations) return (window as any).__ong_annotations[ongId] || null;
  return null;
}

function __findElementById(id: string): Element | null {
  if (!id) return null;
  if (id.startsWith('_ong:')) {
    return document.querySelector('[_ong="' + id.slice(5) + '"]');
  }
  return document.querySelector('[data-elements-id="' + id + '"]');
}
