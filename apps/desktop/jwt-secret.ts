import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Get or create a persistent random secret for the desktop app, stored
 * under the user's app data directory with owner-only permissions.
 *
 * Used for both the JWT signing secret (session continuity across restarts)
 * and the at-rest encryption key for stored API keys / credentials.
 *
 * NEVER rotate the encryption key file by hand — it would render every
 * encrypted value in the SQLite database undecryptable.
 */
async function getOrCreateSecret(userDataPath: string, filename: string): Promise<string> {
  const secretPath = path.join(userDataPath, filename);

  if (fs.existsSync(secretPath)) {
    return fs.readFileSync(secretPath, 'utf-8').trim();
  }

  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
}

export const getOrCreateJwtSecret = (userDataPath: string) =>
  getOrCreateSecret(userDataPath, '.jwt-secret');

/**
 * Get or create the AES-256 key used to encrypt user API keys / OAuth tokens
 * at rest in SQLite.
 *
 * Backward-compatibility: earlier desktop releases shipped without an
 * encryption key file, so the server fell back to the documented insecure
 * default `'default-insecure-key-change-me'` (utils/crypto.ts) and every
 * existing credential was encrypted with that key. To avoid corrupting
 * those values on upgrade we seed `.encryption-key` with the legacy default
 * when we detect a prior install (signalled by the presence of `.jwt-secret`,
 * which has shipped since an earlier release). Fresh installs get a fully
 * random key. The server's validateConfig() will log a loud warning for
 * upgraded installs so operators know to migrate.
 */
export async function getOrCreateEncryptionKey(userDataPath: string): Promise<string> {
  const keyPath = path.join(userDataPath, '.encryption-key');

  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8').trim();
  }

  const isUpgrade = fs.existsSync(path.join(userDataPath, '.jwt-secret'));
  const secret = isUpgrade
    ? 'default-insecure-key-change-me'
    : crypto.randomBytes(32).toString('hex');

  fs.writeFileSync(keyPath, secret, { mode: 0o600 });
  return secret;
}
