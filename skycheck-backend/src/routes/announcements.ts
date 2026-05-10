import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';

const router = Router();
const prisma  = new PrismaClient();

// ── GET /announcements — all active announcements ─────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const now = new Date();

    const [school, gov] = await Promise.all([
      prisma.schoolAnnouncement.findMany({
        where: {
          effectiveAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        orderBy: { effectiveAt: 'desc' },
        take: 10,
      }),
      prisma.govAnnouncement.findMany({
        where: {
          isActive:    true,
          effectiveAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        orderBy: { effectiveAt: 'desc' },
        take: 20,
      }),
    ]);

    res.json({ school, gov });
  } catch {
    res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
});

// ── GET /announcements/school/latest ──────────────────────────────
router.get('/school/latest', requireAuth, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const ann = await prisma.schoolAnnouncement.findFirst({
      where: {
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { effectiveAt: 'desc' },
    });
    res.json(ann ?? null);
  } catch {
    res.status(500).json({ error: 'Failed to fetch school announcement.' });
  }
});

// ── POST /announcements/school — create (no auth guard for demo) ──
// In production: add admin middleware
router.post('/school', requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, title, body, effectiveAt, expiresAt, postedBy, sourceUrl } = req.body;
    if (!status || !title || !effectiveAt) {
      res.status(400).json({ error: 'status, title, and effectiveAt are required.' });
      return;
    }
    const ann = await prisma.schoolAnnouncement.create({
      data: {
        status, title, body: body ?? null,
        effectiveAt: new Date(effectiveAt),
        expiresAt:   expiresAt ? new Date(expiresAt) : null,
        postedBy:    postedBy ?? null,
        sourceUrl:   sourceUrl ?? null,
      },
    });
    res.status(201).json(ann);
  } catch {
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

// ── POST /announcements/gov ────────────────────────────────────────
router.post('/gov', requireAuth, async (req: Request, res: Response) => {
  try {
    const { source, title, body, severity, effectiveAt, expiresAt, sourceUrl } = req.body;
    if (!source || !title || !body || !effectiveAt) {
      res.status(400).json({ error: 'source, title, body, and effectiveAt are required.' });
      return;
    }
    const ann = await prisma.govAnnouncement.create({
      data: {
        source, title, body,
        severity:    severity ?? 'INFO',
        effectiveAt: new Date(effectiveAt),
        expiresAt:   expiresAt ? new Date(expiresAt) : null,
        sourceUrl:   sourceUrl ?? null,
      },
    });
    res.status(201).json(ann);
  } catch {
    res.status(500).json({ error: 'Failed to create government announcement.' });
  }
});

// ── DELETE /announcements/gov/:id ─────────────────────────────────
router.delete('/gov/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.govAnnouncement.update({
      where: {id: req.params.id as string },
      data:  { isActive: false },
    });
    res.json({ message: 'Advisory deactivated.' });
  } catch {
    res.status(500).json({ error: 'Failed to deactivate advisory.' });
  }
});

export default router;
