import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCODING = 'hex';
const IV_LENGTH = 16;

// Derive a stable 32-byte key from whatever string is provided in the environment
const rawKey = process.env.ENCRYPTION_KEY || 'default-insecure-key-change-me';
const KEY = crypto.createHash('sha256').update(rawKey).digest();

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString(ENCODING) + ':' + encrypted.toString(ENCODING);
}

export function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text;
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, ENCODING);
  const encryptedText = Buffer.from(textParts.join(':'), ENCODING);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
