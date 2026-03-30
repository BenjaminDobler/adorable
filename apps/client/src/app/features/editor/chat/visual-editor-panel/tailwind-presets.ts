export interface TailwindPreset {
  label: string;
  class: string;
  color?: string; // CSS color for swatch display
}

export interface TailwindCategory {
  name: string;
  icon: string;
  groups: TailwindPresetGroup[];
}

export interface TailwindPresetGroup {
  label: string;
  presets: TailwindPreset[];
}

const SHADE_LABELS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

const COLOR_PALETTE: { name: string; shades: Record<string, string> }[] = [
  { name: 'slate', shades: { '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a' } },
  { name: 'gray', shades: { '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db', '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151', '800': '#1f2937', '900': '#111827' } },
  { name: 'red', shades: { '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5', '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d' } },
  { name: 'orange', shades: { '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74', '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c', '800': '#9a3412', '900': '#7c2d12' } },
  { name: 'amber', shades: { '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d', '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '800': '#92400e', '900': '#78350f' } },
  { name: 'yellow', shades: { '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047', '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207', '800': '#854d0e', '900': '#713f12' } },
  { name: 'green', shades: { '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac', '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d' } },
  { name: 'teal', shades: { '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4', '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59', '900': '#134e4a' } },
  { name: 'cyan', shades: { '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9', '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490', '800': '#155e75', '900': '#164e63' } },
  { name: 'blue', shades: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a' } },
  { name: 'indigo', shades: { '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc', '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca', '800': '#3730a3', '900': '#312e81' } },
  { name: 'violet', shades: { '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd', '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9', '800': '#5b21b6', '900': '#4c1d95' } },
  { name: 'purple', shades: { '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe', '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce', '800': '#6b21a8', '900': '#581c87' } },
  { name: 'pink', shades: { '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4', '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d', '800': '#9d174d', '900': '#831843' } },
];

function buildColorPresets(prefix: 'text' | 'bg'): TailwindPresetGroup[] {
  const groups: TailwindPresetGroup[] = [];

  // Special colors
  const specials: TailwindPreset[] = [
    { label: prefix === 'text' ? 'black' : 'black', class: `${prefix}-black`, color: '#000000' },
    { label: 'white', class: `${prefix}-white`, color: '#ffffff' },
  ];
  if (prefix === 'bg') {
    specials.push({ label: 'transparent', class: 'bg-transparent', color: 'transparent' });
  }
  groups.push({ label: prefix === 'text' ? 'Text Colors' : 'Background Colors', presets: specials });

  for (const c of COLOR_PALETTE) {
    groups.push({
      label: c.name,
      presets: SHADE_LABELS.map(s => ({
        label: `${s}`,
        class: `${prefix}-${c.name}-${s}`,
        color: c.shades[s],
      })),
    });
  }
  return groups;
}

export const TAILWIND_CATEGORIES: TailwindCategory[] = [
  {
    name: 'Colors',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    groups: [
      ...buildColorPresets('text'),
      ...buildColorPresets('bg'),
    ],
  },
  {
    name: 'Typography',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>',
    groups: [
      {
        label: 'Font Size',
        presets: [
          { label: 'xs', class: 'text-xs' },
          { label: 'sm', class: 'text-sm' },
          { label: 'base', class: 'text-base' },
          { label: 'lg', class: 'text-lg' },
          { label: 'xl', class: 'text-xl' },
          { label: '2xl', class: 'text-2xl' },
          { label: '3xl', class: 'text-3xl' },
        ],
      },
      {
        label: 'Font Weight',
        presets: [
          { label: 'thin', class: 'font-thin' },
          { label: 'light', class: 'font-light' },
          { label: 'normal', class: 'font-normal' },
          { label: 'medium', class: 'font-medium' },
          { label: 'semibold', class: 'font-semibold' },
          { label: 'bold', class: 'font-bold' },
          { label: 'extrabold', class: 'font-extrabold' },
        ],
      },
      {
        label: 'Text Align',
        presets: [
          { label: 'left', class: 'text-left' },
          { label: 'center', class: 'text-center' },
          { label: 'right', class: 'text-right' },
          { label: 'justify', class: 'text-justify' },
        ],
      },
    ],
  },
  {
    name: 'Spacing',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    groups: [
      {
        label: 'Padding',
        presets: ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16'].map(v => ({ label: `p-${v}`, class: `p-${v}` })),
      },
      {
        label: 'Padding X / Y',
        presets: [
          ...['0', '1', '2', '3', '4', '6', '8'].map(v => ({ label: `px-${v}`, class: `px-${v}` })),
          ...['0', '1', '2', '3', '4', '6', '8'].map(v => ({ label: `py-${v}`, class: `py-${v}` })),
        ],
      },
      {
        label: 'Margin',
        presets: ['0', '1', '2', '3', '4', '5', '6', '8', '10', '12', '16', 'auto'].map(v => ({ label: `m-${v}`, class: `m-${v}` })),
      },
      {
        label: 'Margin X / Y',
        presets: [
          ...['0', '1', '2', '3', '4', '6', '8', 'auto'].map(v => ({ label: `mx-${v}`, class: `mx-${v}` })),
          ...['0', '1', '2', '3', '4', '6', '8', 'auto'].map(v => ({ label: `my-${v}`, class: `my-${v}` })),
        ],
      },
      {
        label: 'Gap',
        presets: ['0', '1', '2', '3', '4', '5', '6', '8'].map(v => ({ label: `gap-${v}`, class: `gap-${v}` })),
      },
      {
        label: 'Width',
        presets: [
          { label: 'w-full', class: 'w-full' },
          { label: 'w-auto', class: 'w-auto' },
          { label: 'w-1/2', class: 'w-1/2' },
          { label: 'w-screen', class: 'w-screen' },
        ],
      },
      {
        label: 'Height',
        presets: [
          { label: 'h-full', class: 'h-full' },
          { label: 'h-auto', class: 'h-auto' },
          { label: 'h-screen', class: 'h-screen' },
        ],
      },
    ],
  },
  {
    name: 'Layout',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
    groups: [
      {
        label: 'Display',
        presets: [
          { label: 'flex', class: 'flex' },
          { label: 'grid', class: 'grid' },
          { label: 'block', class: 'block' },
          { label: 'inline', class: 'inline' },
          { label: 'inline-flex', class: 'inline-flex' },
          { label: 'hidden', class: 'hidden' },
        ],
      },
      {
        label: 'Flex Direction',
        presets: [
          { label: 'row', class: 'flex-row' },
          { label: 'col', class: 'flex-col' },
          { label: 'row-reverse', class: 'flex-row-reverse' },
          { label: 'col-reverse', class: 'flex-col-reverse' },
        ],
      },
      {
        label: 'Justify Content',
        presets: [
          { label: 'start', class: 'justify-start' },
          { label: 'center', class: 'justify-center' },
          { label: 'end', class: 'justify-end' },
          { label: 'between', class: 'justify-between' },
          { label: 'around', class: 'justify-around' },
          { label: 'evenly', class: 'justify-evenly' },
        ],
      },
      {
        label: 'Align Items',
        presets: [
          { label: 'start', class: 'items-start' },
          { label: 'center', class: 'items-center' },
          { label: 'end', class: 'items-end' },
          { label: 'stretch', class: 'items-stretch' },
          { label: 'baseline', class: 'items-baseline' },
        ],
      },
      {
        label: 'Grid Columns',
        presets: [
          { label: '1', class: 'grid-cols-1' },
          { label: '2', class: 'grid-cols-2' },
          { label: '3', class: 'grid-cols-3' },
          { label: '4', class: 'grid-cols-4' },
          { label: '6', class: 'grid-cols-6' },
          { label: '12', class: 'grid-cols-12' },
        ],
      },
    ],
  },
  {
    name: 'Borders & Effects',
    icon: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
    groups: [
      {
        label: 'Border Radius',
        presets: [
          { label: 'none', class: 'rounded-none' },
          { label: 'sm', class: 'rounded-sm' },
          { label: 'md', class: 'rounded-md' },
          { label: 'lg', class: 'rounded-lg' },
          { label: 'xl', class: 'rounded-xl' },
          { label: '2xl', class: 'rounded-2xl' },
          { label: 'full', class: 'rounded-full' },
        ],
      },
      {
        label: 'Border Width',
        presets: [
          { label: 'border', class: 'border' },
          { label: '0', class: 'border-0' },
          { label: '2', class: 'border-2' },
          { label: '4', class: 'border-4' },
        ],
      },
      {
        label: 'Shadow',
        presets: [
          { label: 'none', class: 'shadow-none' },
          { label: 'sm', class: 'shadow-sm' },
          { label: 'md', class: 'shadow-md' },
          { label: 'lg', class: 'shadow-lg' },
          { label: 'xl', class: 'shadow-xl' },
          { label: '2xl', class: 'shadow-2xl' },
        ],
      },
      {
        label: 'Opacity',
        presets: [
          { label: '0', class: 'opacity-0' },
          { label: '25', class: 'opacity-25' },
          { label: '50', class: 'opacity-50' },
          { label: '75', class: 'opacity-75' },
          { label: '100', class: 'opacity-100' },
        ],
      },
    ],
  },
];

/**
 * Returns a copy of TAILWIND_CATEGORIES with all class names prefixed.
 * E.g. with prefix 'tw-', 'flex' becomes 'tw-flex', 'text-lg' becomes 'tw-text-lg'.
 */
export function getPrefixedCategories(prefix: string): TailwindCategory[] {
  if (!prefix) return TAILWIND_CATEGORIES;
  return TAILWIND_CATEGORIES.map(cat => ({
    ...cat,
    groups: cat.groups.map(group => ({
      ...group,
      presets: group.presets.map(preset => ({
        ...preset,
        class: prefix + preset.class,
      })),
    })),
  }));
}

/**
 * Strips the Tailwind prefix from a class name for conflict detection.
 */
export function stripPrefix(cls: string, prefix: string): string {
  if (prefix && cls.startsWith(prefix)) return cls.slice(prefix.length);
  return cls;
}

// Known text-size classes to distinguish from text-{color}
const TEXT_SIZES = new Set(['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl', 'text-6xl', 'text-7xl', 'text-8xl', 'text-9xl']);
const TEXT_ALIGNS = new Set(['text-left', 'text-center', 'text-right', 'text-justify']);

/**
 * Returns the conflict group prefix for a Tailwind class.
 * Classes in the same group conflict with each other (only one should be active).
 */
export function getConflictPrefix(cls: string): string | null {
  // Text size group
  if (TEXT_SIZES.has(cls)) return 'text-size';

  // Text align group
  if (TEXT_ALIGNS.has(cls)) return 'text-align';

  // Text color: text-{color}-{shade} or text-black/white
  if (cls.startsWith('text-') && !TEXT_SIZES.has(cls) && !TEXT_ALIGNS.has(cls)) return 'text-color';

  // Background color
  if (cls.startsWith('bg-')) return 'bg-color';

  // Font weight
  if (cls.startsWith('font-')) return 'font-weight';

  // Padding (all-sides)
  if (/^p-\d/.test(cls) || cls === 'p-auto') return 'p';
  if (/^px-/.test(cls)) return 'px';
  if (/^py-/.test(cls)) return 'py';
  if (/^pt-/.test(cls)) return 'pt';
  if (/^pr-/.test(cls)) return 'pr';
  if (/^pb-/.test(cls)) return 'pb';
  if (/^pl-/.test(cls)) return 'pl';

  // Margin
  if (/^m-/.test(cls) && !cls.startsWith('mx-') && !cls.startsWith('my-')) return 'm';
  if (/^mx-/.test(cls)) return 'mx';
  if (/^my-/.test(cls)) return 'my';

  // Gap
  if (/^gap-/.test(cls)) return 'gap';

  // Width / Height
  if (cls.startsWith('w-')) return 'w';
  if (cls.startsWith('h-')) return 'h';

  // Display
  if (['flex', 'grid', 'block', 'inline', 'inline-flex', 'inline-block', 'hidden'].includes(cls)) return 'display';

  // Flex direction
  if (cls.startsWith('flex-row') || cls.startsWith('flex-col')) return 'flex-direction';

  // Justify
  if (cls.startsWith('justify-')) return 'justify';

  // Align items
  if (cls.startsWith('items-')) return 'items';

  // Grid cols
  if (cls.startsWith('grid-cols-')) return 'grid-cols';

  // Border radius
  if (cls.startsWith('rounded')) return 'rounded';

  // Border width
  if (cls === 'border' || /^border-\d/.test(cls)) return 'border-width';

  // Shadow
  if (cls.startsWith('shadow')) return 'shadow';

  // Opacity
  if (cls.startsWith('opacity-')) return 'opacity';

  return null;
}
