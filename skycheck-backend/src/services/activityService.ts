import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const touchThrottle = new Map<string, number>();
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_ACTIVE_WINDOW_MINUTES = 120;

export function activeSinceDate(): Date {
  const minutes = Math.max(
    15,
    Number.parseInt(process.env.ACTIVE_USER_WINDOW_MINUTES ?? `${DEFAULT_ACTIVE_WINDOW_MINUTES}`, 10)
      || DEFAULT_ACTIVE_WINDOW_MINUTES,
  );
  return new Date(Date.now() - minutes * 60 * 1000);
}

export function getActiveWindowMinutes(): number {
  return Math.max(
    15,
    Number.parseInt(process.env.ACTIVE_USER_WINDOW_MINUTES ?? `${DEFAULT_ACTIVE_WINDOW_MINUTES}`, 10)
      || DEFAULT_ACTIVE_WINDOW_MINUTES,
  );
}

export function touchUserActivity(userId: string, force = false): void {
  const now = Date.now();
  const previous = touchThrottle.get(userId) ?? 0;
  if (!force && now - previous < TOUCH_INTERVAL_MS) return;

  touchThrottle.set(userId, now);
  prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date(now) },
  }).catch((err) => {
    console.warn('[Activity] Failed to mark user active:', (err as Error).message);
  });
}
