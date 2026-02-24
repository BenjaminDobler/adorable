import { prisma } from '../db/prisma';

const DEFAULTS: Record<string, string> = {
  'registration.mode': 'open',
  'registration.emailVerification': 'false',
  'containers.maxActive': '5',
  'smtp.host': '',
  'smtp.port': '587',
  'smtp.user': '',
  'smtp.pass': '',
  'smtp.from': 'noreply@example.com',
};

class ServerConfigService {
  private cache = new Map<string, string>();

  async initialize() {
    // Load all config rows into cache
    const rows = await prisma.serverConfig.findMany();
    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }

    // Seed defaults for any missing keys
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!this.cache.has(key)) {
        await prisma.serverConfig.create({ data: { key, value } });
        this.cache.set(key, value);
      }
    }

    // Load SMTP defaults from env vars if config values are empty
    const envMap: Record<string, string | undefined> = {
      'smtp.host': process.env['SMTP_HOST'],
      'smtp.port': process.env['SMTP_PORT'],
      'smtp.user': process.env['SMTP_USER'],
      'smtp.pass': process.env['SMTP_PASS'],
      'smtp.from': process.env['SMTP_FROM'],
    };
    for (const [key, envVal] of Object.entries(envMap)) {
      if (envVal && !this.cache.get(key)) {
        await this.set(key, envVal);
      }
    }

    // Promote earliest user to admin if none exists
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount === 0) {
      const earliest = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
      if (earliest) {
        await prisma.user.update({
          where: { id: earliest.id },
          data: { role: 'admin', emailVerified: true },
        });
        console.log(`[ServerConfig] Promoted user ${earliest.email} to admin`);
      }
    }
  }

  get(key: string): string {
    return this.cache.get(key) ?? DEFAULTS[key] ?? '';
  }

  async set(key: string, value: string) {
    await prisma.serverConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cache.set(key, value);
  }

  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.cache) {
      result[key] = value;
    }
    return result;
  }
}

export const serverConfigService = new ServerConfigService();
