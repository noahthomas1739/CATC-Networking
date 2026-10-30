import 'server-only';
import { headers } from 'next/headers';
import { hmac } from './crypto';

/** Client IP as reported by the platform proxy (Vercel sets x-real-ip / x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function ipHash(): Promise<string> {
  return hmac(`ip:${await clientIp()}`);
}

/** Coarse device description for the "active sessions" list. */
export async function deviceLabel(): Promise<string> {
  const ua = (await headers()).get('user-agent') ?? '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}
