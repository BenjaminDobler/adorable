import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { JWT_SECRET } from '../config';
import { authRateLimit, registerRateLimit } from '../middleware/rate-limit';
import { authenticate } from '../middleware/auth';
import { serverConfigService } from '../services/server-config.service';
import { emailService } from '../services/email.service';

const router = express.Router();

// Public config endpoint — returns registration mode and email verification status
router.get('/config', (req, res) => {
  res.json({
    registrationMode: serverConfigService.get('registration.mode'),
    emailVerification: serverConfigService.get('registration.emailVerification') === 'true',
  });
});

router.post('/register', registerRateLimit, async (req, res) => {
  const { email, password, confirmPassword, name, inviteCode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  // Password validation
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  // Clear any existing container cookie
  res.clearCookie('adorable_container_user');

  try {
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    // Check invite-only mode (first user always allowed)
    if (!isFirstUser && serverConfigService.get('registration.mode') === 'invite-only') {
      if (!inviteCode) {
        return res.status(400).json({ error: 'An invite code is required to register' });
      }
      const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!invite || invite.usedBy || (invite.expiresAt && invite.expiresAt < new Date())) {
        return res.status(400).json({ error: 'Invalid or expired invite code' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // First user becomes admin with verified email
    const role = isFirstUser ? 'admin' : 'user';
    const emailVerificationEnabled = serverConfigService.get('registration.emailVerification') === 'true';
    const emailVerified = isFirstUser || !emailVerificationEnabled;
    const emailVerificationToken = (!emailVerified && emailVerificationEnabled)
      ? crypto.randomBytes(32).toString('hex')
      : null;

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        emailVerified,
        emailVerificationToken,
      }
    });

    // Mark invite code as used
    if (inviteCode) {
      await prisma.inviteCode.updateMany({
        where: { code: inviteCode, usedBy: null },
        data: { usedBy: user.id, usedAt: new Date() },
      });
    }

    // Send verification email if needed
    if (!emailVerified && emailService.isConfigured()) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await emailService.sendVerificationEmail(email, emailVerificationToken!, baseUrl);
      return res.json({
        message: 'Account created. Please check your email to verify your account.',
        requiresVerification: true,
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if ((error as any).code === 'P2002') {
      return res.status(400).json({ error: 'User already exists' });
    }
    res.status(500).json({ error: 'Registration failed', details: (error as any).message });
  }
});

router.post('/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  // Clear any existing container cookie
  res.clearCookie('adorable_container_user');

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', code: 'EMAIL_NOT_VERIFIED' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('adorable_container_user');
  res.json({ success: true });
});

// Email verification
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid verification token' });
  }

  try {
    const user = await prisma.user.findFirst({ where: { emailVerificationToken: token } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });

    // Redirect to login with success param
    res.redirect('/login?verified=true');
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticate, async (req: any, res) => {
  const user = req.user;
  if (user.emailVerified) {
    return res.json({ message: 'Email already verified' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: token },
  });

  if (emailService.isConfigured()) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    await emailService.sendVerificationEmail(user.email, token, baseUrl);
    return res.json({ message: 'Verification email sent' });
  }

  res.status(503).json({ error: 'Email service is not configured' });
});

export const authRouter = router;
