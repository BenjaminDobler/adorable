import express from 'express';
import { prisma } from '../db/prisma';
import { decrypt, encrypt } from '../utils/crypto';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);

router.get('/', async (req: any, res) => {
  const { password, ...userWithoutPassword } = req.user;
  
  if (userWithoutPassword.settings) {
     try {
       const settings = JSON.parse(userWithoutPassword.settings);
       if (settings.profiles) {
          settings.profiles = settings.profiles.map((p: any) => {
             if (p.apiKey) {
                try {
                   const decrypted = decrypt(p.apiKey);
                   p.apiKey = decrypted.substring(0, 7) + '...' + decrypted.substring(decrypted.length - 4);
                } catch(e) {
                   p.apiKey = '********';
                }
             }
             return p;
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
       
       finalSettingsString = JSON.stringify({ ...settings, profiles: processedProfiles });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : undefined,
        settings: finalSettingsString
      }
    });
    
    const userSettings = updatedUser.settings ? JSON.parse(updatedUser.settings) : {};
    if (userSettings.profiles) {
        userSettings.profiles = userSettings.profiles.map((p: any) => {
            if (p.apiKey) {
                try {
                   const decrypted = decrypt(p.apiKey);
                   return { ...p, apiKey: decrypted.substring(0, 7) + '...' + decrypted.substring(decrypted.length - 4) };
                } catch (e) {
                   return { ...p, apiKey: '********' };
                }
            }
            return p;
        });
    }
    
    res.json({ ...updatedUser, settings: JSON.stringify(userSettings), password: undefined });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export const profileRouter = router;
