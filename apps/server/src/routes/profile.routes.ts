import express from 'express';
import { prisma } from '../db/prisma';
import { decrypt, encrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

/**
 * Mask an API key for display: show first 7 and last 4 characters
 */
function maskApiKey(encryptedKey: string): string {
  try {
    const decrypted = decrypt(encryptedKey);
    return decrypted.substring(0, 7) + '...' + decrypted.substring(decrypted.length - 4);
  } catch (e) {
    return '********';
  }
}

router.get('/', async (req: any, res) => {
  const { password, ...userWithoutPassword } = req.user;

  if (userWithoutPassword.settings) {
    try {
      const settings = JSON.parse(userWithoutPassword.settings);

      // Mask profile API keys and SAP secrets
      if (settings.profiles) {
        settings.profiles = settings.profiles.map((p: any) => {
          if (p.apiKey) {
            p.apiKey = maskApiKey(p.apiKey);
          }
          if (p.sapAiCore?.clientSecret) {
            p.sapAiCore = { ...p.sapAiCore, clientSecret: maskApiKey(p.sapAiCore.clientSecret) };
          }
          return p;
        });
      }

      // Mask MCP server API keys
      if (settings.mcpServers) {
        settings.mcpServers = settings.mcpServers.map((server: any) => {
          if (server.apiKey) {
            server.apiKey = maskApiKey(server.apiKey);
          }
          return server;
        });
      }

      userWithoutPassword.settings = JSON.stringify(settings);
    } catch (e) {
      console.error('Failed to parse settings for masking', e);
    }
  }

  res.json(userWithoutPassword);
});

router.post('/', async (req: any, res) => {
  const user = req.user;
  const { name, settings } = req.body;

  try {
    let finalSettingsString = undefined;

    if (settings !== undefined) {
      const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
      const currentSettings = currentUser?.settings ? JSON.parse(currentUser.settings) : {};
      const existingProfiles = currentSettings.profiles || [];
      const existingMcpServers = currentSettings.mcpServers || [];

      // Process AI profiles
      const newProfiles = settings.profiles || [];
      const processedProfiles = newProfiles.map((p: any) => {
        const existing = existingProfiles.find((ep: any) => ep.id === p.id || ep.provider === p.provider);

        if (p.apiKey) {
          if (p.apiKey.includes('...')) {
            p = { ...p, apiKey: existing ? existing.apiKey : '' };
          } else {
            p = { ...p, apiKey: encrypt(p.apiKey) };
          }
        }

        // Handle SAP AI Core client secret encryption
        if (p.sapAiCore?.clientSecret) {
          if (p.sapAiCore.clientSecret.includes('...')) {
            // Masked — keep existing encrypted value
            p = { ...p, sapAiCore: { ...p.sapAiCore, clientSecret: existing?.sapAiCore?.clientSecret || '' } };
          } else {
            // New value — encrypt it
            p = { ...p, sapAiCore: { ...p.sapAiCore, clientSecret: encrypt(p.sapAiCore.clientSecret) } };
          }
        }

        return p;
      });

      // Process MCP servers
      const newMcpServers = settings.mcpServers || [];
      const processedMcpServers = newMcpServers.map((server: any) => {
        const existing = existingMcpServers.find((es: any) => es.id === server.id);

        if (server.apiKey) {
          // If masked, keep existing encrypted value
          if (server.apiKey.includes('...')) {
            return { ...server, apiKey: existing ? existing.apiKey : '' };
          }
          // Encrypt new API key
          return { ...server, apiKey: encrypt(server.apiKey) };
        }
        return server;
      });

      // Preserve fields from existing settings that the profile page doesn't manage
      // (e.g., kits are managed by kit.routes.ts, not the profile page)
      const preservedFields: Record<string, any> = {};
      if (currentSettings.kits) preservedFields.kits = currentSettings.kits;

      finalSettingsString = JSON.stringify({
        ...settings,
        ...preservedFields,
        profiles: processedProfiles,
        mcpServers: processedMcpServers
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : undefined,
        settings: finalSettingsString
      }
    });

    // Mask API keys in response
    const userSettings = updatedUser.settings ? JSON.parse(updatedUser.settings) : {};

    if (userSettings.profiles) {
      userSettings.profiles = userSettings.profiles.map((p: any) => {
        if (p.apiKey) {
          p = { ...p, apiKey: maskApiKey(p.apiKey) };
        }
        if (p.sapAiCore?.clientSecret) {
          p = { ...p, sapAiCore: { ...p.sapAiCore, clientSecret: maskApiKey(p.sapAiCore.clientSecret) } };
        }
        return p;
      });
    }

    if (userSettings.mcpServers) {
      userSettings.mcpServers = userSettings.mcpServers.map((server: any) => {
        if (server.apiKey) {
          return { ...server, apiKey: maskApiKey(server.apiKey) };
        }
        return server;
      });
    }

    res.json({ ...updatedUser, settings: JSON.stringify(userSettings), password: undefined });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export const profileRouter = router;
