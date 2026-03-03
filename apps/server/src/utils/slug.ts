import { randomBytes } from 'crypto';

/**
 * Generate a 12-character random alphanumeric slug for published site URLs.
 */
export function generateSlug(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}
