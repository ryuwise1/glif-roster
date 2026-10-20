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
// 진짜 Supabase 에서는 위 기본 권한(표·시퀀스·함수를 anon/authenticated/service_role 에 부여)에 더해
// Postgres 기본값(함수 EXECUTE 는 PUBLIC)도 그대로 적용된다. PGlite 의 기본값도 같다.

async function buildTemplate(): Promise<PGlite> {
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

// 마이그레이션 전체를 적용하는 데 몇 초가 걸리므로, 한 번만 적용한 견본을 만들어 두고 복제해서 쓴다.
let template: Promise<PGlite> | undefined

export async function createDb(): Promise<PGlite> {
  template ??= buildTemplate()
  return (await (await template).clone()) as PGlite
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
