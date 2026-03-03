import { serverConfigService } from '../services/server-config.service';

export const requireCloudEditorAccess = (req: any, res: any, next: any) => {
  const mode = serverConfigService.get('cloudEditor.accessMode');
  if (mode !== 'allowlist') return next();
  if (req.user?.role === 'admin') return next();
  if (req.user?.cloudEditorAllowed) return next();
  return res.status(403).json({ error: 'Cloud editor access is restricted. Please use the desktop app or contact an administrator.', code: 'CLOUD_EDITOR_ACCESS_DENIED' });
};
