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

      // Mask profile API keys
      if (settings.profiles) {
        settings.profiles = settings.profiles.map((p: any) => {
          if (p.apiKey) {
            p.apiKey = maskApiKey(p.apiKey);
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
            return { ...p, apiKey: existing ? existing.apiKey : '' };
          }
          return { ...p, apiKey: encrypt(p.apiKey) };
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

      finalSettingsString = JSON.stringify({
        ...settings,
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
          return { ...p, apiKey: maskApiKey(p.apiKey) };
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
