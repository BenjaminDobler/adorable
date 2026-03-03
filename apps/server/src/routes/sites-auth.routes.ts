import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { JWT_SECRET } from '../config';

const router = express.Router();

/**
 * GET /api/sites/auth/login?redirect=<url>
 * Serves a self-contained HTML login page for private site access.
 */
router.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/';

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in — Adorable</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #16161e;
      border: 1px solid #2a2a3a;
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 380px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      text-align: center;
    }
    .subtitle {
      font-size: 0.875rem;
      color: #888;
      text-align: center;
      margin-bottom: 1.5rem;
    }
    label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      color: #999;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0e0e14;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e5e5e5;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #34d399;
      box-shadow: 0 0 0 3px rgba(52,211,153,0.15);
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #34d399;
      color: #000;
      border: none;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    button:hover { background: #2cc489; transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    .error {
      background: rgba(248,113,113,0.1);
      border: 1px solid rgba(248,113,113,0.3);
      color: #f87171;
      padding: 0.625rem 0.875rem;
      border-radius: 8px;
      font-size: 0.8125rem;
      margin-bottom: 1rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign in to view this site</h1>
    <p class="subtitle">This site is private. Please sign in to continue.</p>
    <div class="error" id="error"></div>
    <form id="form">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autofocus placeholder="you@example.com" />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required placeholder="Your password" />
      <button type="submit">Sign in</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('form');
    const errorEl = document.getElementById('error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/sites/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, redirect: ${JSON.stringify(redirect)} }),
          redirect: 'follow',
          credentials: 'same-origin',
        });
        if (res.redirected) {
          window.location.href = res.url;
        } else {
          const data = await res.json().catch(() => ({}));
          errorEl.textContent = data.error || 'Login failed';
          errorEl.style.display = 'block';
        }
      } catch {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
});

/**
 * POST /api/sites/auth/verify
 * Validates email/password, sets adorable_site_token cookie, redirects to site.
 */
router.post('/verify', async (req, res) => {
  const { email, password, redirect } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account has been disabled' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('adorable_site_token', token, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const redirectUrl = redirect || '/';
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('[SitesAuth] Verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sites/auth/token-exchange
 * Called by the Angular client with Bearer token to set the site cookie.
 * This lets already-logged-in users view private sites without re-entering credentials.
 */
router.post('/token-exchange', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];

  if (!bearerToken) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  try {
    const decoded = jwt.verify(bearerToken, JWT_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const siteToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('adorable_site_token', siteToken, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export const sitesAuthRouter = router;
