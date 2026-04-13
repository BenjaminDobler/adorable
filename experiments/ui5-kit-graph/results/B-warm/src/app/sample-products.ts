export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1,  name: 'Laptop Pro 15',       price: 1299.99, category: 'Electronics',  description: 'High-performance laptop with 15" display, 16 GB RAM, and 512 GB SSD.' },
  { id: 2,  name: 'Wireless Headphones',  price:  199.99, category: 'Electronics',  description: 'Noise-cancelling over-ear headphones with 30-hour battery life.' },
  { id: 3,  name: 'Ergonomic Office Chair',price:  449.00, category: 'Furniture',    description: 'Fully adjustable chair with lumbar support and breathable mesh back.' },
  { id: 4,  name: 'Standing Desk',         price:  699.50, category: 'Furniture',    description: 'Electric height-adjustable desk with memory presets and cable management.' },
  { id: 5,  name: 'Mechanical Keyboard',   price:   89.95, category: 'Peripherals',  description: 'Compact TKL layout with Cherry MX switches and RGB backlighting.' },
  { id: 6,  name: '4K Monitor 27"',        price:  549.00, category: 'Electronics',  description: 'IPS panel with 144 Hz refresh rate, HDR support, and USB-C connectivity.' },
  { id: 7,  name: 'Webcam HD 1080p',        price:   79.99, category: 'Peripherals',  description: 'Full-HD webcam with auto-focus, built-in microphone, and privacy shutter.' },
  { id: 8,  name: 'USB-C Hub 7-in-1',       price:   49.99, category: 'Accessories', description: 'Expands a single USB-C port into HDMI, USB-A, SD card, and PD charging.' },
];
