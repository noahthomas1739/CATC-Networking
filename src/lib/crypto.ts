import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env';

/** 256-bit random token, URL-safe. Only its hash is ever stored. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Keyed hash for values we must correlate but should not store (IPs, emails in rate-limit keys). */
export function hmac(value: string): string {
  return createHmac('sha256', env().HASH_SECRET).update(value).digest('base64url').slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
