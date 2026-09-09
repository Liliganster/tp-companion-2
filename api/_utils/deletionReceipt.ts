import { createHmac, timingSafeEqual } from 'node:crypto';

/** Short-lived proof for the final acknowledgement after the login itself is removed. */
export function createDeletionReceipt(userId: string, secret: string, now = Date.now()) {
  if (!secret) throw new Error('missing_receipt_secret');
  const payload = Buffer.from(JSON.stringify({ userId, expires: now + 3600000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`account-deletion:${payload}`).digest('base64url')}`;
}

export function verifyDeletionReceipt(value: unknown, secret: string, now = Date.now()): string | null {
  if (!secret || typeof value !== 'string' || value.length > 1000) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret).update(`account-deletion:${parts[0]}`).digest();
  const supplied = Buffer.from(parts[1], 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return typeof parsed.userId === 'string' && typeof parsed.expires === 'number' && parsed.expires > now ? parsed.userId : null;
  } catch { return null; }
}
