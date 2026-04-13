export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1,  name: 'Wireless Headphones',    price: 129.99, category: 'Electronics',   description: 'Premium over-ear wireless headphones with 30-hour battery life and active noise cancellation.' },
  { id: 2,  name: 'Ergonomic Office Chair', price: 399.00, category: 'Furniture',     description: 'Adjustable lumbar support chair designed for all-day comfort in home and office environments.' },
  { id: 3,  name: 'Mechanical Keyboard',    price: 89.95,  category: 'Electronics',   description: 'Compact TKL mechanical keyboard with Cherry MX switches and per-key RGB lighting.' },
  { id: 4,  name: 'Stainless Steel Bottle', price: 34.50,  category: 'Kitchen',       description: 'Double-walled vacuum insulated bottle that keeps drinks cold 24 h or hot 12 h.' },
  { id: 5,  name: '4K Monitor 27"',         price: 549.00, category: 'Electronics',   description: 'Ultra-sharp 27-inch 4K IPS display with USB-C power delivery and 144 Hz refresh rate.' },
  { id: 6,  name: 'Yoga Mat Pro',           price: 65.00,  category: 'Sports',        description: 'Non-slip, eco-friendly natural rubber yoga mat with alignment lines and carrying strap.' },
  { id: 7,  name: 'Coffee Grinder Burr',    price: 119.00, category: 'Kitchen',       description: 'Conical burr grinder with 40 grind settings for espresso, drip, and French press.' },
  { id: 8,  name: 'Leather Backpack',       price: 210.00, category: 'Accessories',   description: 'Full-grain leather backpack with padded laptop sleeve (up to 15") and brass hardware.' },
];
