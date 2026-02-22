import * as path from 'path';

export const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret';
export const PORT = process.env.PORT || 3333;

// Support configurable paths via env vars for desktop mode
export const SITES_DIR = process.env['SITES_DIR'] || path.join(process.cwd(), 'published-sites');
export const STORAGE_DIR = process.env['STORAGE_DIR'] || path.join(process.cwd(), 'storage');
export const KITS_DIR = process.env['KITS_DIR'] || path.join(STORAGE_DIR, 'kits');
