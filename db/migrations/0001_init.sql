-- CATC Business Directory: initial schema.
--
-- Security model (see SECURITY.md):
--  * Migrations run as the database owner. The app connects as `catc_app`,
--    which owns nothing, cannot bypass RLS, and has only the grants below.
--  * Every app transaction sets `app.ctx` ('member' | 'admin' | 'system') and
--    `app.user_id` via set_config(..., true). Policies read those values.
--    With nothing set, every policy evaluates to false (deny by default).
--  * 'system' is used only by auth bootstrap code (session lookup, login,
--    invite redemption) and maintenance jobs. See src/lib/db.ts.

create extension if not exists citext;
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'catc_app') then
    create role catc_app login nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Context helpers
-- ---------------------------------------------------------------------------

create or replace function app_ctx() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.ctx', true), ''), 'none')
$$;

create or replace function app_uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null unique,
  role              text not null default 'member' check (role in ('member', 'admin')),
  status            text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  age_confirmed_at  timestamptz not null,
  terms_accepted_at timestamptz not null,
  approved_at       timestamptz,
  approved_by       uuid references users(id) on delete set null,
  last_login_at     timestamptz,
  created_at        timestamptz not null default now()
);

create table categories (
  id         serial primary key,
  name       text not null unique check (char_length(name) between 1 and 60),
  active     boolean not null default true,
  sort_order int not null default 0
);

create table profiles (
  user_id       uuid primary key references users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  business_name text not null check (char_length(business_name) between 1 and 100),
  category_id   int references categories(id) on delete set null,
  description   text check (char_length(description) <= 600),
  services      text check (char_length(services) <= 600),
  service_area  text check (char_length(service_area) <= 120),
  contact_note  text check (char_length(contact_note) <= 200),
  updated_at    timestamptz not null default now()
);

-- One row per contact method so visibility can be enforced per field by RLS.
create table contact_methods (
  user_id uuid not null references users(id) on delete cascade,
  kind    text not null check (kind in ('email', 'phone', 'website')),
  value   text not null check (char_length(value) between 1 and 200),
  visible boolean not null default false,
  primary key (user_id, kind)
);

create table photos (
  user_id    uuid primary key references users(id) on delete cascade,
  data       bytea not null,
  updated_at timestamptz not null default now()
);

create table passkeys (
  id           text primary key, -- base64url credential id
  user_id      uuid not null references users(id) on delete cascade,
  public_key   bytea not null,
  counter      bigint not null default 0,
  transports   text[] not null default '{}',
  label        text not null default 'Passkey',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index on passkeys(user_id);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    bytea not null unique, -- sha256 of the cookie value
  auth_method   text not null check (auth_method in ('passkey', 'magic_link', 'invite')),
  user_verified boolean not null default false,
  device        text not null default '',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  idle_seconds  int not null,
  expires_at    timestamptz not null
);
create index on sessions(user_id);

create table webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  challenge  text not null,
  purpose    text not null check (purpose in ('register', 'authenticate')),
  user_id    uuid references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table magic_links (
  token_hash bytea primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz
);

create table invites (
  id         uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  email      citext not null,
  role       text not null default 'member' check (role in ('member', 'admin')),
  created_by uuid references users(id) on delete set null, -- null = CLI
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references users(id) on delete set null,
  revoked_at timestamptz
);

create table threads (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references users(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index on threads(sender_id);
create index on threads(recipient_id);

create table messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references threads(id) on delete cascade,
  sender_id  uuid not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on messages(thread_id, created_at);

create table recommendations (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references users(id) on delete cascade,
  author_id  uuid not null references users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (subject_id, author_id),
  check (subject_id <> author_id)
);

create table reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references users(id) on delete set null,
  target_type       text not null check (target_type in ('profile', 'message', 'recommendation')),
  target_user_id    uuid references users(id) on delete set null,
  message_id        uuid references messages(id) on delete set null,
  recommendation_id uuid references recommendations(id) on delete set null,
  reason            text not null check (reason in ('spam', 'scam', 'harassment', 'inappropriate', 'other')),
  details           text check (char_length(details) <= 1000),
  status            text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by       uuid references users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Append-only. No FKs so entries survive account deletion; IDs only, never
-- secrets, tokens, emails, or message contents.
create table audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  action     text not null,
  target_id  uuid,
  meta       jsonb not null default '{}',
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index on audit_log(created_at desc);

create table rate_limits (
  key          text primary key,
  count        int not null,
  window_start timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Policy helpers. SECURITY DEFINER so they can read users/blocks/threads
-- without granting members direct access; they only return booleans.
-- ---------------------------------------------------------------------------

create or replace function app_is_system() returns boolean
language sql stable as $$ select app_ctx() = 'system' $$;

create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select app_ctx() = 'admin' and exists (
    select 1 from users where id = app_uid() and role = 'admin' and status = 'active')
$$;

create or replace function app_is_privileged() returns boolean
language sql stable as $$ select app_is_system() or app_is_admin() $$;

-- The current viewer is an approved, non-suspended member (or admin).
create or replace function app_viewer_active() returns boolean
language sql stable security definer set search_path = public as $$
  select app_ctx() in ('member', 'admin') and exists (
    select 1 from users where id = app_uid() and status = 'active')
$$;

create or replace function app_user_active(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = target and status = 'active')
$$;

create or replace function app_is_participant(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from threads
    where id = t and app_uid() in (sender_id, recipient_id))
$$;

create or replace function app_message_reported(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reports where message_id = m)
$$;

-- True if either user has blocked the other.
create or replace function app_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

revoke all on function app_is_admin(), app_viewer_active(), app_user_active(uuid),
  app_is_participant(uuid), app_message_reported(uuid), app_blocked_between(uuid, uuid) from public;
grant execute on function app_ctx(), app_uid(), app_is_system(), app_is_admin(), app_is_privileged(),
  app_viewer_active(), app_user_active(uuid), app_is_participant(uuid),
  app_message_reported(uuid), app_blocked_between(uuid, uuid) to catc_app;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table users               enable row level security;
alter table categories          enable row level security;
alter table profiles            enable row level security;
alter table contact_methods     enable row level security;
alter table photos              enable row level security;
alter table passkeys            enable row level security;
alter table sessions            enable row level security;
alter table webauthn_challenges enable row level security;
alter table magic_links         enable row level security;
alter table invites             enable row level security;
alter table threads             enable row level security;
alter table messages            enable row level security;
alter table recommendations     enable row level security;
alter table reports             enable row level security;
alter table blocks              enable row level security;
alter table audit_log           enable row level security;
alter table rate_limits         enable row level security;

-- users: you see yourself; admins and system see everyone. Members never see
-- other users' rows (emails live here).
create policy users_select on users for select
  using (id = app_uid() or app_is_privileged());
create policy users_write on users for all
  using (app_is_privileged()) with check (app_is_privileged());

-- categories: readable by any signed-in context; admins edit.
create policy categories_select on categories for select
  using (app_ctx() in ('member', 'admin', 'system'));
create policy categories_write on categories for all
  using (app_is_privileged()) with check (app_is_privileged());

-- profiles: own profile always; others only if both viewer and owner are active.
create policy profiles_select on profiles for select
  using (user_id = app_uid() or app_is_privileged()
         or (app_viewer_active() and app_user_active(user_id)));
create policy profiles_insert on profiles for insert
  with check (user_id = app_uid() or app_is_privileged());
create policy profiles_update on profiles for update
  using (user_id = app_uid() or app_is_privileged())
  with check (user_id = app_uid() or app_is_privileged());
create policy profiles_delete on profiles for delete
  using (app_is_privileged());

-- contact methods: per-row visibility flag. Admins can see them (moderation).
create policy contacts_select on contact_methods for select
  using (user_id = app_uid() or app_is_privileged()
         or (visible and app_viewer_active() and app_user_active(user_id)));
create policy contacts_write on contact_methods for all
  using (user_id = app_uid() or app_is_privileged())
  with check (user_id = app_uid() or app_is_privileged());

create policy photos_select on photos for select
  using (user_id = app_uid() or app_is_privileged()
         or (app_viewer_active() and app_user_active(user_id)));
create policy photos_write on photos for all
  using (user_id = app_uid() or app_is_privileged())
  with check (user_id = app_uid() or app_is_privileged());

-- passkeys/sessions: owner can list and delete their own; system does auth.
create policy passkeys_owner on passkeys for select using (user_id = app_uid() or app_is_system());
create policy passkeys_delete on passkeys for delete using (user_id = app_uid() or app_is_system());
create policy passkeys_system on passkeys for all using (app_is_system()) with check (app_is_system());

create policy sessions_owner on sessions for select using (user_id = app_uid() or app_is_system());
create policy sessions_delete on sessions for delete using (user_id = app_uid() or app_is_privileged());
create policy sessions_system on sessions for all using (app_is_system()) with check (app_is_system());

create policy challenges_system on webauthn_challenges for all using (app_is_system()) with check (app_is_system());
create policy magic_system on magic_links for all using (app_is_system()) with check (app_is_system());
create policy rate_system on rate_limits for all using (app_is_system()) with check (app_is_system());

create policy invites_priv on invites for all
  using (app_is_privileged()) with check (app_is_privileged());

-- threads/messages: participants only. Admins see a message only once it has
-- been reported, and never browse threads.
create policy threads_select on threads for select
  using (app_uid() in (sender_id, recipient_id) or app_is_system());
create policy threads_insert on threads for insert
  with check (sender_id = app_uid() and app_viewer_active()
              and app_user_active(recipient_id)
              and not app_blocked_between(sender_id, recipient_id));
create policy threads_update on threads for update
  using (app_uid() in (sender_id, recipient_id))
  with check (app_uid() in (sender_id, recipient_id));

create policy messages_select on messages for select
  using (app_is_participant(thread_id) or app_is_system()
         or (app_is_admin() and app_message_reported(id)));
create policy messages_insert on messages for insert
  with check (sender_id = app_uid() and app_viewer_active() and app_is_participant(thread_id));

-- recommendations
create policy recs_select on recommendations for select
  using (app_uid() in (author_id, subject_id) or app_is_privileged()
         or (not hidden and app_viewer_active()
             and app_user_active(subject_id) and app_user_active(author_id)));
create policy recs_insert on recommendations for insert
  with check (author_id = app_uid() and app_viewer_active() and app_user_active(subject_id));
create policy recs_update on recommendations for update
  using (subject_id = app_uid() or app_is_privileged())
  with check (subject_id = app_uid() or app_is_privileged());
create policy recs_delete on recommendations for delete
  using (author_id = app_uid() or app_is_privileged());

-- reports: reporters see their own; admins see all.
create policy reports_select on reports for select
  using (reporter_id = app_uid() or app_is_privileged());
create policy reports_insert on reports for insert
  with check (reporter_id = app_uid() and app_viewer_active());
create policy reports_update on reports for update
  using (app_is_privileged()) with check (app_is_privileged());

create policy blocks_owner on blocks for all
  using (blocker_id = app_uid() or app_is_system())
  with check (blocker_id = app_uid());

-- audit log: anyone in a context may append entries about themselves;
-- only admins/system read. No update/delete grants at all.
create policy audit_insert on audit_log for insert
  with check (app_is_privileged() or (actor_id = app_uid() and app_ctx() in ('member', 'admin')));
create policy audit_select on audit_log for select using (app_is_privileged());

-- ---------------------------------------------------------------------------
-- Grants for the app role (least privilege)
-- ---------------------------------------------------------------------------

grant usage on schema public to catc_app;
grant select, insert, update, delete on
  users, categories, profiles, contact_methods, photos, passkeys, sessions,
  webauthn_challenges, magic_links, invites, blocks, rate_limits
  to catc_app;
grant select, insert, update on threads to catc_app;
grant select, insert on messages to catc_app;
grant select, insert, delete on recommendations to catc_app;
grant update (hidden) on recommendations to catc_app;
grant select, insert on reports to catc_app;
grant update (status, resolved_by, resolved_at) on reports to catc_app;
grant select, insert on audit_log to catc_app;
grant usage on sequence categories_id_seq, audit_log_id_seq to catc_app;
