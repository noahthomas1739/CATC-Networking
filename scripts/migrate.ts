import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { escapeLiteral } from 'pg';
import { ownerPool } from './_db';

async function main() {
  const pool = ownerPool();
  const client = await pool.connect();
  try {
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const dir = path.join(process.cwd(), 'db', 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      console.log(`Applying ${f}`);
      await client.query('begin');
      try {
        await client.query(await readFile(path.join(dir, f), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
    }
    // Set the app role's password from the environment (never stored in the repo).
    if (process.env.APP_DB_PASSWORD) {
      await client.query(`alter role catc_app with login password ${escapeLiteral(process.env.APP_DB_PASSWORD)}`);
      console.log('Set password for role catc_app');
    }
    console.log('Migrations up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
