import { describe, expect, it } from 'vitest';
import { lineText, likeEscape, profileSchema, websiteSchema } from '@/lib/validation';

describe('input validation', () => {
  it('only accepts http(s) websites without credentials', () => {
    expect(websiteSchema.parse('example.com')).toBe('https://example.com/');
    expect(websiteSchema.parse('http://example.com/a')).toBe('http://example.com/a');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@example.com', 'ftp://example.com', 'vbscript:x', 'localhost']) {
      expect(websiteSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('strips control and bidi-override characters', () => {
    expect(lineText(80).parse(' Bob‮\u0000 \n Smith​ ')).toBe('Bob Smith');
  });

  it('enforces length limits', () => {
    expect(lineText(5).safeParse('123456').success).toBe(false);
  });

  it('escapes LIKE wildcards', () => {
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('parses a profile with per-field visibility', () => {
    const p = profileSchema.parse({
      displayName: 'A', businessName: 'B', categoryId: '', email: { value: 'X@Example.com', visible: 'on' },
      phone: { value: '' }, website: { value: 'example.org' },
    });
    expect(p.email).toEqual({ value: 'x@example.com', visible: true });
    expect(p.phone).toEqual({ value: null, visible: false });
    expect(p.website).toEqual({ value: 'https://example.org/', visible: false });
    expect(p.categoryId).toBeNull();
  });
});
