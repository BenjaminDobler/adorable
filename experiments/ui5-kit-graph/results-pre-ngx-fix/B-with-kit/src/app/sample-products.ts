export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1,  name: 'Wireless Headphones',   price: 129.99, category: 'Electronics',   description: 'Premium over-ear headphones with active noise cancellation and 30-hour battery life.' },
  { id: 2,  name: 'Mechanical Keyboard',    price: 89.99,  category: 'Peripherals',   description: 'Compact TKL layout with Cherry MX switches and per-key RGB backlighting.' },
  { id: 3,  name: 'USB-C Docking Station',  price: 199.99, category: 'Peripherals',   description: 'Connect up to 12 peripherals including dual 4K monitors via a single USB-C cable.' },
  { id: 4,  name: 'Ergonomic Office Chair', price: 449.00, category: 'Furniture',     description: 'Lumbar-support mesh chair with adjustable armrests and breathable seat cushion.' },
  { id: 5,  name: '4K Webcam',              price: 74.99,  category: 'Electronics',   description: 'Ultra-HD 4K streaming camera with built-in ring light and auto-focus.' },
  { id: 6,  name: 'Standing Desk Mat',      price: 39.99,  category: 'Furniture',     description: 'Anti-fatigue cushioning mat with beveled edges and non-slip bottom.' },
  { id: 7,  name: 'NVMe SSD 1TB',           price: 109.99, category: 'Storage',       description: 'PCIe Gen 4 NVMe solid-state drive with read speeds up to 7,000 MB/s.' },
  { id: 8,  name: 'Smart LED Desk Lamp',    price: 59.99,  category: 'Lighting',      description: 'Touch-dimmable lamp with USB-C charging port and five colour-temperature modes.' },
];
