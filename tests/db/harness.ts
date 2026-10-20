import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))

// Supabase가 기본으로 제공하는 것 중 마이그레이션이 기대는 부분만 흉내 낸다.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`

export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  let files: string[] = []
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  } catch (err) {
    // 마이그레이션 폴더가 아직 없을 때만 흉내만 적용된 DB를 돌려주고, 그 밖의 오류는 그대로 던진다
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }
  return db
}

export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  try {
    await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}
