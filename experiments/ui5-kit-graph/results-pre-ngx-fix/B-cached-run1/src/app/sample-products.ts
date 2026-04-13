export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1, name: 'Ergonomic Office Chair',  price: 349.99, category: 'Furniture',    description: 'Adjustable lumbar support, breathable mesh back, and armrests for all-day comfort.' },
  { id: 2, name: 'Standing Desk Pro',        price: 599.00, category: 'Furniture',    description: 'Electric height-adjustable desk with memory presets and sturdy steel frame.' },
  { id: 3, name: 'Noise-Cancelling Headset', price: 199.95, category: 'Electronics',  description: 'Over-ear ANC headset with 30-hour battery life and premium audio quality.' },
  { id: 4, name: '4K Ultrawide Monitor',     price: 899.00, category: 'Electronics',  description: '34-inch curved UHD display with 144 Hz refresh rate and HDR support.' },
  { id: 5, name: 'Mechanical Keyboard',      price: 129.99, category: 'Accessories',  description: 'Tenkeyless layout with Cherry MX switches and per-key RGB lighting.' },
  { id: 6, name: 'Wireless Laser Mouse',     price:  79.90, category: 'Accessories',  description: 'Precision 4000 DPI sensor, silent clicks, and up to 60-day battery life.' },
  { id: 7, name: 'USB-C Docking Station',    price: 249.00, category: 'Accessories',  description: 'Triple-display support, 100 W PD charging, and 10 ports in one hub.' },
  { id: 8, name: 'Laptop Backpack 15"',      price:  89.50, category: 'Bags',         description: 'Water-resistant, TSA-friendly laptop compartment with ergonomic shoulder straps.' },
];
