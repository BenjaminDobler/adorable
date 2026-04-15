/**
 * css-to-figma.ts
 *
 * Deterministic CSS → Figma property mapping.
 * Pure function: takes a NodeSpec with CSS values, returns a Figma-ready spec.
 * No LLM involved — mechanical 1:1 translations.
 */

export interface NodeSpec {
  tag: string;
  type: 'frame' | 'text' | 'image';
  name?: string;
  text?: string;
  bounds: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
  children: NodeSpec[];
  /** CSS variables used by this element (e.g. { '--sapBrandColor': '#0070f2' }) */
  cssVariables?: Record<string, string>;
  /** Angular component name if detected via ng.getComponent */
  angularComponent?: string;
  /** ONG annotation ID */
  ongId?: string;
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaFill {
  type: 'SOLID';
  color: FigmaColor;
  opacity?: number;
}

export interface FigmaStroke {
  type: 'SOLID';
  color: FigmaColor;
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: FigmaColor;
  offset: { x: number; y: number };
  radius: number;
  visible: boolean;
}

export interface FigmaNodeSpec {
  type: 'frame' | 'text';
  name: string;
  width: number;
  height: number;

  // Visual
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  cornerRadius?: number;
  cornerRadii?: { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number };
  effects?: FigmaEffect[];
  opacity?: number;
  clipsContent?: boolean;
  visible?: boolean;

  // Layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';

  // Text
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  lineHeight?: number;
  letterSpacing?: number;
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE';
  textColor?: FigmaColor;

  // Metadata
  cssVariables?: Record<string, string>;
  angularComponent?: string;

  children: FigmaNodeSpec[];
}

// ─── Color Parsing ───

function parseColor(cssColor: string): FigmaColor | null {
  if (!cssColor || cssColor === 'transparent' || cssColor === 'rgba(0, 0, 0, 0)') return null;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // #hex
  const hexMatch = cssColor.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  return null;
}

function parsePx(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// ─── CSS → Figma Mapping ───

function mapFontWeight(weight: string): string {
  const w = parseInt(weight) || 400;
  if (w <= 100) return 'Thin';
  if (w <= 200) return 'Extra Light';
  if (w <= 300) return 'Light';
  if (w <= 400) return 'Regular';
  if (w <= 500) return 'Medium';
  if (w <= 600) return 'Semi Bold';
  if (w <= 700) return 'Bold';
  if (w <= 800) return 'Extra Bold';
  return 'Black';
}

function mapTextAlign(align: string): 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' {
  switch (align) {
    case 'center': return 'CENTER';
    case 'right': return 'RIGHT';
    case 'justify': return 'JUSTIFIED';
    default: return 'LEFT';
  }
}

function mapJustifyContent(value: string): string {
  switch (value) {
    case 'center': return 'CENTER';
    case 'flex-end': case 'end': return 'MAX';
    case 'space-between': return 'SPACE_BETWEEN';
    case 'space-around': case 'space-evenly': return 'SPACE_BETWEEN';
    default: return 'MIN';
  }
}

function mapAlignItems(value: string): string {
  switch (value) {
    case 'center': return 'CENTER';
    case 'flex-end': case 'end': return 'MAX';
    case 'stretch': return 'STRETCH';
    case 'baseline': return 'BASELINE';
    default: return 'MIN';
  }
}

function mapBoxShadow(shadow: string): FigmaEffect | null {
  // Parse: offset-x offset-y blur-radius spread-radius color
  // e.g. "0px 2px 4px 0px rgba(0, 0, 0, 0.15)"
  const match = shadow.match(/([\d.-]+)px\s+([\d.-]+)px\s+([\d.-]+)px\s+(?:[\d.-]+px\s+)?(.+)/);
  if (!match) return null;

  const color = parseColor(match[4].trim());
  if (!color) return null;

  return {
    type: 'DROP_SHADOW',
    color,
    offset: { x: parseFloat(match[1]), y: parseFloat(match[2]) },
    radius: parseFloat(match[3]),
    visible: true,
  };
}

// ─── Main Converter ───

export function cssToFigma(node: NodeSpec): FigmaNodeSpec {
  const s = node.styles;
  const isText = node.type === 'text' && node.text;

  // Determine a meaningful name
  const name = node.angularComponent
    || (node.tag.includes('-') ? node.tag : undefined)
    || node.name
    || node.tag;

  const result: FigmaNodeSpec = {
    type: isText ? 'text' : 'frame',
    name,
    width: Math.max(1, Math.round(node.bounds.width)),
    height: Math.max(1, Math.round(node.bounds.height)),
    children: [],
    cssVariables: node.cssVariables,
    angularComponent: node.angularComponent,
  };

  // ─── Background / Fills ───
  const bgColor = parseColor(s.backgroundColor);
  if (bgColor && bgColor.a && bgColor.a > 0.01) {
    result.fills = [{
      type: 'SOLID',
      color: { r: bgColor.r, g: bgColor.g, b: bgColor.b },
      opacity: bgColor.a < 1 ? bgColor.a : undefined,
    }];
  } else {
    result.fills = []; // transparent
  }

  // ─── Border / Strokes ───
  const borderColor = parseColor(s.borderColor || s.borderTopColor);
  const borderWidth = parsePx(s.borderWidth || s.borderTopWidth);
  if (borderColor && borderWidth > 0) {
    result.strokes = [{ type: 'SOLID', color: borderColor }];
    result.strokeWeight = borderWidth;
  }

  // ─── Corner Radius ───
  const tl = parsePx(s.borderTopLeftRadius);
  const tr = parsePx(s.borderTopRightRadius);
  const bl = parsePx(s.borderBottomLeftRadius);
  const br = parsePx(s.borderBottomRightRadius);
  if (tl === tr && tr === bl && bl === br && tl > 0) {
    result.cornerRadius = Math.round(tl);
  } else if (tl > 0 || tr > 0 || bl > 0 || br > 0) {
    result.cornerRadii = {
      topLeft: Math.round(tl),
      topRight: Math.round(tr),
      bottomLeft: Math.round(bl),
      bottomRight: Math.round(br),
    };
  }

  // ─── Box Shadow / Effects ───
  if (s.boxShadow && s.boxShadow !== 'none') {
    const effect = mapBoxShadow(s.boxShadow);
    if (effect) result.effects = [effect];
  }

  // ─── Opacity ───
  const opacity = parseFloat(s.opacity);
  if (!isNaN(opacity) && opacity < 1) {
    result.opacity = opacity;
  }

  // ─── Overflow → Clip ───
  if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') {
    result.clipsContent = true;
  }

  // ─── Visibility ───
  if (s.visibility === 'hidden' || s.display === 'none') {
    result.visible = false;
  }

  // ─── Flexbox → Auto-layout ───
  if (s.display === 'flex' || s.display === 'inline-flex') {
    result.layoutMode = s.flexDirection === 'column' || s.flexDirection === 'column-reverse'
      ? 'VERTICAL'
      : 'HORIZONTAL';

    result.primaryAxisAlignItems = mapJustifyContent(s.justifyContent || 'flex-start');
    result.counterAxisAlignItems = mapAlignItems(s.alignItems || 'stretch');

    const gap = parsePx(s.gap || s.rowGap || s.columnGap);
    if (gap > 0) result.itemSpacing = Math.round(gap);
  }

  // ─── Padding ───
  const pt = parsePx(s.paddingTop);
  const pr = parsePx(s.paddingRight);
  const pb = parsePx(s.paddingBottom);
  const pl = parsePx(s.paddingLeft);
  if (pt > 0 || pr > 0 || pb > 0 || pl > 0) {
    result.paddingTop = Math.round(pt);
    result.paddingRight = Math.round(pr);
    result.paddingBottom = Math.round(pb);
    result.paddingLeft = Math.round(pl);
  }

  // ─── Text Properties ───
  if (isText) {
    result.characters = node.text || '';

    const textColor = parseColor(s.color);
    if (textColor) result.textColor = textColor;

    result.fontSize = Math.round(parsePx(s.fontSize)) || 14;

    // Font family: take the first font from the CSS font stack
    if (s.fontFamily) {
      const firstFont = s.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
      result.fontFamily = firstFont;
    }

    result.fontStyle = mapFontWeight(s.fontWeight || '400');
    result.textAlignHorizontal = mapTextAlign(s.textAlign || 'left');

    const lh = parsePx(s.lineHeight);
    if (lh > 0) result.lineHeight = Math.round(lh);

    const ls = parsePx(s.letterSpacing);
    if (ls !== 0) result.letterSpacing = ls;

    if (s.textDecoration?.includes('underline')) result.textDecoration = 'UNDERLINE';
    else if (s.textDecoration?.includes('line-through')) result.textDecoration = 'STRIKETHROUGH';

    if (s.textTransform === 'uppercase') result.textCase = 'UPPER';
    else if (s.textTransform === 'lowercase') result.textCase = 'LOWER';
    else if (s.textTransform === 'capitalize') result.textCase = 'TITLE';
  }

  // ─── Recursively map children ───
  result.children = node.children.map(child => cssToFigma(child));

  return result;
}
