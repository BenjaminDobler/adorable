/**
 * Type declarations for the preview iframe runtime context.
 * These scripts run inside the user's Angular app preview, not in Adorable itself.
 */

interface Window {
  __adorable_agent_port?: string;
  __ong_annotations?: Record<string, OngAnnotation>;
  ng?: {
    getComponent(el: Element): any;
    getOwningComponent(el: Element): any;
    applyChanges(component: any): void;
  };
  html2canvas?: (element: Element, options?: any) => Promise<HTMLCanvasElement>;
}

interface OngAnnotation {
  file: string;
  line: number;
  col: number;
  tag: string;
  component: string;
  selector: string;
  tsFile: string;
  parent: number | null;
  inLoop: boolean;
  conditional: boolean;
  text: { hasText: boolean; type: string; content: string };
  bindings: {
    inputs: Record<string, string>;
    outputs: Record<string, string>;
    twoWay: Record<string, string>;
    structural: string[];
  };
}

// Global helpers injected by element-helpers.ts (not wrapped in IIFE)
declare function __getElementId(el: Element): string | null;
declare function __getOngAnnotation(el: Element): OngAnnotation | null;
declare function __findElementById(id: string): Element | null;
