import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { PrismaClient } from '@prisma/client';
import { signToken, requireAuth } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail, getEmailConfigStatus } from '../services/emailService';
import { verifyFirebaseIdToken } from '../services/firebaseAdmin';
import { RISK } from '../constants/risk';

const router = Router();
const prisma = new PrismaClient();

function requireEmailVerification(): boolean {
  // Default: require in production. In development, require only if explicitly enabled.
  // This prevents "can't login after signup" when email sending isn't configured locally.
  const override = process.env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function emailIsConfigured(): boolean {
  return getEmailConfigStatus().configured;
}

function googleClientId(): string | null {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

let googleOAuth2: OAuth2Client | undefined;
function getGoogleOAuth2(): OAuth2Client | null {
  const cid = googleClientId();
  if (!cid) return null;
  if (!googleOAuth2) googleOAuth2 = new OAuth2Client(cid);
  return googleOAuth2;
}

// ── Rate Limiters ─────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please wait 15 minutes.' },
});

// ── POST /auth/register ───────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ error: 'All fields are required.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) {
      // Anti-enumeration: same message whether user exists or not
      res.status(201).json({ message: 'Registration successful. Check your email to verify your account.' });
      return;
    }

    const passHash   = await bcrypt.hash(password, 12);
    const verifyTok  = crypto.randomBytes(32).toString('hex');
    const verifyExp  = new Date(Date.now() + RISK.AUTH.VERIFY_EXPIRE_H * 60 * 60 * 1000);

    const mustVerify = requireEmailVerification();
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        passHash,
        isVerified: mustVerify ? false : true,
        verifyTok: mustVerify ? verifyTok : null,
        verifyExp: mustVerify ? verifyExp : null,
      },
    });

    if (mustVerify) {
      if (!emailIsConfigured()) {
        console.warn('[Email] Cannot send verification email; email service is not configured.', getEmailConfigStatus());
      } else {
        await sendVerificationEmail(user.email, user.name, verifyTok).catch(err =>
          console.error('[Email] Failed to send verification:', err)
        );
      }
    }

    res.status(201).json({
      message: mustVerify
        ? 'Registration successful. Check your email to verify your account.'
        : 'Registration successful. You can now log in.',
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /auth/google ─────────────────────────────────────────────
router.post('/google', loginLimiter, async (req: Request, res: Response) => {
  try {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken.trim()) {
      res.status(400).json({ error: 'Missing Google credential.' });
      return;
    }
    const clientId = googleClientId();
    if (!clientId) {
      res.status(503).json({ error: 'Google sign-in is not configured.' });
      return;
    }

    const oAuth = getGoogleOAuth2();
    if (!oAuth) {
      res.status(503).json({ error: 'Google sign-in is not configured.' });
      return;
    }

    let ticket;
    try {
      ticket = await oAuth.verifyIdToken({ idToken: idToken.trim(), audience: clientId });
    } catch {
      res.status(401).json({ error: 'Google sign-in could not be verified.' });
      return;
    }

    const payload = ticket.getPayload();
    const sub = payload?.sub?.trim();
    const emailRaw = payload?.email?.trim().toLowerCase();
    // Google Omits fields for some Workspace flows; reject only explicitly unverified Gmail.
    if (!sub || !emailRaw || payload?.email_verified === false) {
      res.status(403).json({ error: 'Your Google email must be verified to use SkyCheck.' });
      return;
    }

    const displayName =
      typeof payload?.name === 'string' && payload.name.trim().length > 0
        ? payload.name.trim().slice(0, 120)
        : emailRaw.split('@')[0]!.slice(0, 120);

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: sub }, { email: emailRaw }] },
    });

    if (user?.googleId && user.googleId !== sub) {
      res.status(409).json({ error: 'This Google account conflicts with another user.' });
      return;
    }

    if (user && user.email !== emailRaw) {
      res.status(409).json({
        error: 'That email is tied to another account. Try a different Google account.',
      });
      return;
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: displayName,
          email: emailRaw,
          googleId: sub,
          passHash: null,
          isVerified: true,
        },
      });
    } else {
      const data: {
        googleId?: string;
        isVerified?: boolean;
        verifyTok?: null;
        verifyExp?: null;
      } = {};
      if (!user.googleId) data.googleId = sub;
      if (!user.isVerified) {
        data.isVerified = true;
        data.verifyTok = null;
        data.verifyExp = null;
      }
      if (Object.keys(data).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    const token = signToken(user.id, user.email);
    res.json({
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        preferences: {
          morningAlerts: user.morningAlerts,
          alertSound: user.alertSound,
          vibration: user.vibration,
        },
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Auth] Google:', err);
    res.status(500).json({ error: 'Google sign-in failed.' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────
router.post('/firebase', loginLimiter, async (req: Request, res: Response) => {
  try {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    if (!idToken) {
      res.status(400).json({ error: 'Missing Firebase credential.' });
      return;
    }

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      console.error('[Firebase] Token verification failed:', err);
      res.status(401).json({ error: 'Firebase sign-in could not be verified.' });
      return;
    }

    const email = decoded.email?.trim().toLowerCase();
    const provider = decoded.firebase?.sign_in_provider;
    const displayName = (decoded.name || email?.split('@')[0] || 'SkyCheck User').trim().slice(0, 120);
    const verified = decoded.email_verified === true || provider === 'google.com';

    if (!email) {
      res.status(403).json({ error: 'Your Firebase account must have an email address.' });
      return;
    }

    if (!verified) {
      res.status(403).json({ error: 'Please verify your email address before logging in.', code: 'EMAIL_UNVERIFIED' });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: displayName,
          email,
          passHash: null,
          googleId: provider === 'google.com' ? decoded.uid : null,
          isVerified: true,
        },
      });
    } else {
      const data: {
        name?: string;
        isVerified?: boolean;
        verifyTok?: null;
        verifyExp?: null;
        googleId?: string;
      } = {};

      if (!user.name?.trim()) data.name = displayName;
      if (!user.isVerified) {
        data.isVerified = true;
        data.verifyTok = null;
        data.verifyExp = null;
      }
      if (provider === 'google.com' && !user.googleId) data.googleId = decoded.uid;

      if (Object.keys(data).length > 0) {
        user = await prisma.user.update({ where: { id: user.id }, data });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });

    const token = signToken(user.id, user.email);
    res.json({
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: true,
        preferences: {
          morningAlerts: user.morningAlerts,
          alertSound: user.alertSound,
          vibration: user.vibration,
        },
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Auth] Firebase:', err);
    res.status(500).json({ error: 'Firebase sign-in failed.' });
  }
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Generic error message (anti-enumeration)
    const invalid = () => res.status(401).json({ error: 'Invalid email or password. Try again.' });

    if (!user) { invalid(); return; }

    if (!user.passHash) {
      res.status(401).json({
        error: 'This email uses Sign in with Google. Use Continue with Google below.',
        code: 'USE_GOOGLE',
      });
      return;
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      res.status(403).json({ error: `Account locked. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` });
      return;
    }

    const valid = await bcrypt.compare(password, user.passHash);
    if (!valid) {
      const failed = user.failedLogins + 1;
      const lockUntil = failed >= RISK.AUTH.MAX_FAILED
        ? new Date(Date.now() + RISK.AUTH.LOCK_MINUTES * 60 * 1000)
        : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: lockUntil },
      });
      invalid();
      return;
    }

    if (requireEmailVerification() && !user.isVerified) {
      res.status(403).json({ error: 'Please verify your email address before logging in.', code: 'EMAIL_UNVERIFIED' });
      return;
    }

    // Reset failed logins on success
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

    const token = signToken(user.id, user.email);
    res.json({
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        preferences: {
          morningAlerts: user.morningAlerts,
          alertSound:    user.alertSound,
          vibration:     user.vibration,
        },
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /auth/verify-email ───────────────────────────────────────
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: 'Token is required.' }); return; }

    const user = await prisma.user.findUnique({ where: { verifyTok: token } });

    if (!user || !user.verifyExp || user.verifyExp < new Date()) {
      res.status(400).json({ error: 'Verification link is invalid or has expired.' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verifyTok: null, verifyExp: null },
    });

    const jwt = signToken(user.id, user.email);
    res.json({
      accessToken: jwt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isVerified: true,
        preferences: { morningAlerts: user.morningAlerts, alertSound: user.alertSound, vibration: user.vibration },
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Auth] Verify error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── POST /auth/resend-verification ───────────────────────────────
router.post('/resend-verification', resetLimiter, async (req: Request, res: Response) => {
  const SAME_MSG = { message: 'If that email is registered, a new verification link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) { res.json(SAME_MSG); return; }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && !user.isVerified) {
      const verifyTok = crypto.randomBytes(32).toString('hex');
      const verifyExp = new Date(Date.now() + RISK.AUTH.VERIFY_EXPIRE_H * 60 * 60 * 1000);
      await prisma.user.update({ where: { id: user.id }, data: { verifyTok, verifyExp } });
      await sendVerificationEmail(user.email, user.name, verifyTok).catch(err =>
        console.error('[Email] Failed to resend verification:', err)
      );
    } else if (!user) {
      console.info(`[Email] Verification resend requested for unknown email: ${email.toLowerCase()}`);
    } else if (user.isVerified) {
      console.info(`[Email] Verification resend skipped; account already verified: ${email.toLowerCase()}`);
    }
    res.json(SAME_MSG);
  } catch (err) {
    console.error('[Email] Resend verification route failed:', err);
    res.json(SAME_MSG);
  }
});

// ── POST /auth/forgot-password ────────────────────────────────────
router.post('/forgot-password', resetLimiter, async (req: Request, res: Response) => {
  const SAME_MSG = { message: 'If that email is registered, a password reset link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) { res.json(SAME_MSG); return; }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user?.passHash) {
      const resetTok = crypto.randomBytes(32).toString('hex');
      const resetExp = new Date(Date.now() + RISK.AUTH.RESET_EXPIRE_H * 60 * 60 * 1000);
      await prisma.user.update({ where: { id: user.id }, data: { resetTok, resetExp } });
      await sendPasswordResetEmail(user.email, user.name, resetTok).catch(err =>
        console.error('[Email] Failed to send password reset:', err)
      );
    } else if (!user) {
      console.info(`[Email] Password reset requested for unknown email: ${email.toLowerCase()}`);
    } else if (!user.passHash) {
      console.info(`[Email] Password reset skipped; account uses Google login: ${email.toLowerCase()}`);
    }
    res.json(SAME_MSG);
  } catch (err) {
    console.error('[Email] Forgot password route failed:', err);
    res.json(SAME_MSG);
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { resetTok: token } });
    if (!user || !user.resetExp || user.resetExp < new Date()) {
      res.status(400).json({ error: 'Reset link is invalid or has expired.' });
      return;
    }

    const passHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passHash, resetTok: null, resetExp: null, failedLogins: 0, lockedUntil: null },
    });

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('[Auth] Reset error:', err);
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────
router.post('/logout', requireAuth, async (_req: Request, res: Response) => {
  // JWT is stateless — client must delete the token
  // If needed, maintain a token blocklist here
  res.json({ message: 'Logged out successfully.' });
});

// ── GET /auth/me ──────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      isVerified: user.isVerified,
      preferences: { morningAlerts: user.morningAlerts, alertSound: user.alertSound, vibration: user.vibration },
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user.' });
  }
});

// ── PATCH /auth/preferences ───────────────────────────────────────
router.patch('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { morningAlerts, alertSound, vibration } = req.body;
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(morningAlerts !== undefined && { morningAlerts }),
        ...(alertSound    !== undefined && { alertSound }),
        ...(vibration     !== undefined && { vibration }),
      },
    });
    res.json({
      id: user.id, name: user.name, email: user.email, isVerified: user.isVerified,
      preferences: { morningAlerts: user.morningAlerts, alertSound: user.alertSound, vibration: user.vibration },
      createdAt: user.createdAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to update preferences.' });
  }
});

// ── POST /auth/change-password ────────────────────────────────────
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Both passwords are required.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

    if (!user.passHash) {
      res.status(400).json({ error: 'You sign in with Google — no password stored for this account.' });
      return;
    }

    const valid = await bcrypt.compare(currentPassword, user.passHash);
    if (!valid) { res.status(401).json({ error: 'Current password is incorrect.' }); return; }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    const passHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passHash } });
    res.json({ message: 'Password changed successfully.' });
  } catch {
    res.status(500).json({ error: 'Failed to change password.' });
  }
});
// ── get ────────────────────────────────────
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      return res.status(400).send("Missing token");
    }

    const user = await prisma.user.findUnique({
      where: { verifyTok: token }
    });

    if (!user || !user.verifyExp || user.verifyExp < new Date()) {
      return res.status(400).send("Invalid or expired verification link");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verifyTok: null,
        verifyExp: null
      }
    });

    const frontendUrl = (
      process.env.FRONTEND_URL?.trim()
      || process.env.CLIENT_URL?.trim()
      || 'http://localhost:5173'
    ).replace(/\/+$/, '');

    return res.redirect(`${frontendUrl}/auth/login?verified=true`);

  } catch (err) {
    console.error(err);
    return res.status(500).send("Verification failed");
  }
});
export default router;
