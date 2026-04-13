export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1, name: 'Wireless Headphones', price: 129.99, category: 'Electronics', description: 'Premium over-ear headphones with active noise cancellation and 30-hour battery life.' },
  { id: 2, name: 'Ergonomic Office Chair', price: 349.00, category: 'Furniture', description: 'Adjustable lumbar support, breathable mesh back, and 5-year warranty.' },
  { id: 3, name: 'Stainless Steel Water Bottle', price: 24.95, category: 'Sports', description: 'Double-walled vacuum insulation keeps drinks cold 24 h or hot 12 h.' },
  { id: 4, name: 'Mechanical Keyboard', price: 89.99, category: 'Electronics', description: 'Compact TKL layout with Cherry MX Blue switches and RGB backlighting.' },
  { id: 5, name: 'Yoga Mat', price: 39.99, category: 'Sports', description: 'Non-slip natural rubber surface, 6 mm thick, includes carry strap.' },
  { id: 6, name: 'Ceramic Coffee Mug Set', price: 19.99, category: 'Kitchen', description: 'Set of 4 hand-glazed mugs, dishwasher and microwave safe, 350 ml each.' },
  { id: 7, name: 'LED Desk Lamp', price: 54.50, category: 'Electronics', description: 'Touch-dimming, USB-C charging port, 5 colour temperatures, foldable arm.' },
  { id: 8, name: 'Running Shoes', price: 115.00, category: 'Sports', description: 'Lightweight foam midsole, breathable knit upper, reflective details.' },
];
