import * as path from 'path';

export const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret';
export const PORT = process.env.PORT || 3333;
export const SITES_DIR = path.join(process.cwd(), 'published-sites');
export const STORAGE_DIR = path.join(process.cwd(), 'storage');
