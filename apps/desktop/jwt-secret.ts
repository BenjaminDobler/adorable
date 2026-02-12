import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Gets or creates a persistent JWT secret for the desktop app.
 * The secret is stored in the user's app data directory and persists
 * across app restarts to maintain session continuity.
 */
export async function getOrCreateJwtSecret(userDataPath: string): Promise<string> {
  const secretPath = path.join(userDataPath, '.jwt-secret');

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }

  // Generate a cryptographically secure random secret
  const secret = crypto.randomBytes(32).toString('hex');

  // Write with restricted permissions (owner read/write only)
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });

  return secret;
}
