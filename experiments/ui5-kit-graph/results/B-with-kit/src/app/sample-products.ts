export interface Product { id: number; name: string; price: number; category: string; description: string; }
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 1, name: 'Ergonomic Office Chair',  price: 349.99, category: 'Furniture',    description: 'Lumbar support, adjustable armrests and breathable mesh back.' },
  { id: 2, name: 'Mechanical Keyboard',     price: 129.95, category: 'Electronics', description: 'Tactile brown switches, RGB backlight, USB-C detachable cable.' },
  { id: 3, name: 'Ultra-Wide Monitor',      price: 699.00, category: 'Electronics', description: '34" curved IPS panel, 144 Hz, HDR400, USB-C 90 W PD.' },
  { id: 4, name: 'Standing Desk',           price: 549.00, category: 'Furniture',    description: 'Electric height adjustment 60–125 cm, 80 kg load capacity.' },
  { id: 5, name: 'Wireless Headphones',     price: 249.50, category: 'Audio',        description: 'Active noise cancellation, 30 h battery, foldable design.' },
  { id: 6, name: 'Webcam 4K Pro',           price: 199.00, category: 'Electronics', description: 'Sony STARVIS sensor, built-in ring light, auto-focus.' },
  { id: 7, name: 'USB-C Docking Station',   price: 189.95, category: 'Accessories', description: '12-in-1 hub: dual HDMI, 3× USB-A, SD card, Ethernet, PD 100 W.' },
  { id: 8, name: 'Desk Lamp LED',           price:  59.99, category: 'Lighting',    description: 'Touch dimmer, 5 colour temperatures, USB charging port.' },
];
