// Drizzle table definitions mirroring db/migrations/*.sql.
// The SQL migrations are the source of truth (they also define RLS policies);
// keep this file in sync when you change them.
import {
  bigint, bigserial, boolean, customType, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  role: text('role', { enum: ['member', 'admin'] }).notNull().default('member'),
  status: text('status', { enum: ['pending', 'active', 'suspended'] }).notNull().default('pending'),
  ageConfirmedAt: ts('age_confirmed_at').notNull(),
  termsAcceptedAt: ts('terms_accepted_at').notNull(),
  approvedAt: ts('approved_at'),
  approvedBy: uuid('approved_by'),
  lastLoginAt: ts('last_login_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(),
  displayName: text('display_name').notNull(),
  businessName: text('business_name').notNull(),
  categoryId: integer('category_id'),
  description: text('description'),
  services: text('services'),
  serviceArea: text('service_area'),
  contactNote: text('contact_note'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const CONTACT_KINDS = ['email', 'phone', 'website'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const contactMethods = pgTable('contact_methods', {
  userId: uuid('user_id').notNull(),
  kind: text('kind', { enum: CONTACT_KINDS }).notNull(),
  value: text('value').notNull(),
  visible: boolean('visible').notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.kind] })]);

export const photos = pgTable('photos', {
  userId: uuid('user_id').primaryKey(),
  data: bytea('data').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const passkeys = pgTable('passkeys', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  publicKey: bytea('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: text('transports').array().notNull().default([]),
  label: text('label').notNull().default('Passkey'),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastUsedAt: ts('last_used_at'),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  authMethod: text('auth_method', { enum: ['passkey', 'magic_link', 'invite'] }).notNull(),
  userVerified: boolean('user_verified').notNull().default(false),
  device: text('device').notNull().default(''),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  idleSeconds: integer('idle_seconds').notNull(),
  expiresAt: ts('expires_at').notNull(),
});

export const webauthnChallenges = pgTable('webauthn_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challenge: text('challenge').notNull(),
  purpose: text('purpose', { enum: ['register', 'authenticate'] }).notNull(),
  userId: uuid('user_id'),
  expiresAt: ts('expires_at').notNull(),
});

export const magicLinks = pgTable('magic_links', {
  tokenHash: bytea('token_hash').primaryKey(),
  userId: uuid('user_id').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: bytea('token_hash').notNull(),
  email: citext('email').notNull(),
  role: text('role', { enum: ['member', 'admin'] }).notNull().default('member'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  usedBy: uuid('used_by'),
  revokedAt: ts('revoked_at'),
});

export const threads = pgTable('threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  threadId: uuid('thread_id').notNull(),
  senderId: uuid('sender_id').notNull(),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const recommendations = pgTable('recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  subjectId: uuid('subject_id').notNull(),
  authorId: uuid('author_id').notNull(),
  body: text('body').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const REPORT_REASONS = ['spam', 'scam', 'harassment', 'inappropriate', 'other'] as const;

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id'),
  targetType: text('target_type', { enum: ['profile', 'message', 'recommendation'] }).notNull(),
  targetUserId: uuid('target_user_id'),
  messageId: uuid('message_id'),
  recommendationId: uuid('recommendation_id'),
  reason: text('reason', { enum: REPORT_REASONS }).notNull(),
  details: text('details'),
  status: text('status', { enum: ['open', 'resolved', 'dismissed'] }).notNull().default('open'),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: ts('resolved_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const blocks = pgTable('blocks', {
  blockerId: uuid('blocker_id').notNull(),
  blockedId: uuid('blocked_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })]);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetId: uuid('target_id'),
  meta: jsonb('meta').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  ipHash: text('ip_hash'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: ts('window_start').notNull(),
});
