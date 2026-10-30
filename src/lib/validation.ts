import { z } from 'zod';

// Control, zero-width and bidi-override characters are stripped from all
// free text. Output is always escaped by React; this keeps stored data tidy
// and stops spoofing tricks in names.
const STRIP = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g;

export const cleanText = (max: number, min = 0) =>
  z.string().transform((s) => s.normalize('NFC').replace(STRIP, '').trim()).pipe(z.string().min(min).max(max));

/** Single-line text: also collapses newlines and runs of whitespace. */
export const lineText = (max: number, min = 0) =>
  z.string().transform((s) => s.normalize('NFC').replace(STRIP, '').replace(/\s+/g, ' ').trim()).pipe(z.string().min(min).max(max));

/** Optional field: empty string becomes null. */
export const optional = <T extends z.ZodType<string>>(t: T) =>
  z.union([z.literal('').transform(() => null), t]).nullish().transform((v) => (v ? v : null));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const phoneSchema = z.string().trim().regex(/^[0-9+().\-\s]{7,25}$/, 'Enter a valid phone number');

export const websiteSchema = z.string().trim().max(200).transform((s, ctx) => {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname.includes('.')) {
      throw new Error();
    }
    return u.toString();
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid website (http or https)' });
    return z.NEVER;
  }
});

export const uuidSchema = z.uuid();
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const checkbox = z.literal('on', { error: 'Required' });

export const inviteRedeemSchema = z.object({
  displayName: lineText(80, 1),
  businessName: lineText(100, 1),
  ageConfirm: checkbox,
  termsConfirm: checkbox,
});

const contact = <T extends z.ZodType<string>>(t: T) =>
  z.object({ value: optional(t), visible: z.literal('on').optional().transform((v) => v === 'on') });

export const profileSchema = z.object({
  displayName: lineText(80, 1),
  businessName: lineText(100, 1),
  categoryId: z.union([z.literal('').transform(() => null), z.coerce.number().int().positive()]),
  description: optional(cleanText(600)),
  services: optional(cleanText(600)),
  serviceArea: optional(lineText(120)),
  contactNote: optional(lineText(200)),
  email: contact(emailSchema),
  phone: contact(phoneSchema),
  website: contact(websiteSchema),
});

export const messageSchema = z.object({ body: cleanText(2000, 1) });
export const recommendationSchema = z.object({ body: cleanText(500, 1) });
export const searchSchema = z.object({
  q: optional(lineText(80)),
  category: z.coerce.number().int().positive().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});
export const categoryNameSchema = lineText(60, 1);

/** Turn FormData into a plain object, mapping "a.b" field names to nesting. */
export function formObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string' || k.startsWith('$')) continue;
    const parts = k.split('.');
    let cur = out;
    for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
    cur[parts[parts.length - 1]] = v;
  }
  return out;
}

/** Escape LIKE wildcards in user search input. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
