import { logger } from '../logger';

/**
 * Insecure fallback values defined in the source. If process.env still equals
 * one of these at startup, the operator has not configured a real secret.
 *
 * Keep these in sync with the actual `||` fallbacks in:
 *   - config/index.ts        (JWT_SECRET)
 *   - utils/crypto.ts        (ENCRYPTION_KEY)
 */
const KNOWN_INSECURE_DEFAULTS: Record<string, string> = {
  JWT_SECRET: 'fallback-secret',
  ENCRYPTION_KEY: 'default-insecure-key-change-me',
};

const MIN_SECRET_LENGTH = 16;

export interface ConfigValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Inspect process.env for known security-critical settings. Returns errors
 * (must-fix in production) and warnings (worth surfacing in any env).
 *
 * Pure function — does no logging or process.exit. Use validateConfigOrExit()
 * for the startup integration.
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [name, insecureDefault] of Object.entries(KNOWN_INSECURE_DEFAULTS)) {
    const value = process.env[name];
    if (!value) {
      errors.push(
        `${name} is not set; the server is using an insecure fallback. ` +
        `Generate a random ${MIN_SECRET_LENGTH}+ character value and set it in your environment.`,
      );
    } else if (value === insecureDefault) {
      errors.push(
        `${name} matches the documented insecure default. Replace it with a random value.`,
      );
    } else if (value.length < MIN_SECRET_LENGTH) {
      warnings.push(
        `${name} is shorter than ${MIN_SECRET_LENGTH} characters; consider a longer random value.`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Run validateConfig() and act on the result:
 *   - production: any error → log + process.exit(1)
 *   - desktop or non-production: log errors as warnings and keep running
 *
 * Always logs a startup summary listing which optional integrations
 * (SMTP, OAuth providers, Docker) are wired up.
 */
export function validateConfigOrExit(): void {
  const { errors, warnings } = validateConfig();
  const isProd = process.env['NODE_ENV'] === 'production';
  const isDesktop = process.env['ADORABLE_DESKTOP_MODE'] === 'true';
  const fatal = isProd && !isDesktop;

  for (const w of warnings) logger.warn(w);

  if (errors.length > 0) {
    for (const e of errors) {
      if (fatal) logger.error(e);
      else logger.warn(e);
    }
    if (fatal) {
      logger.error('Refusing to start with insecure defaults in production. Fix the above and retry.');
      process.exit(1);
    }
  }

  logger.info('Startup config', {
    nodeEnv: process.env['NODE_ENV'] || 'development',
    desktop: isDesktop,
    integrations: {
      smtp: !!(process.env['SMTP_HOST'] && process.env['SMTP_USER']),
      githubOAuth: !!process.env['GITHUB_CLIENT_ID'],
      googleOAuth: !!process.env['GOOGLE_CLIENT_ID'],
      docker: !!process.env['DOCKER_SOCKET_PATH'],
    },
  });
}
