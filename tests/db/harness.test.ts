import { afterEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDb } from './harness'

const opened: PGlite[] = []
const open = async () => {
  const db = await createDb()
  opened.push(db)
  return db
}
afterEach(async () => {
  await Promise.all(opened.splice(0).map((d) => d.close()))
})

describe('DB 테스트 환경', () => {
  it('authenticated로 전환하면 auth.uid()가 그 사용자다', async () => {
    const db = await open()
    const id = '00000000-0000-0000-0000-0000000000aa'
    const uid = await asUser(db, id, async () =>
      (await db.query<{ uid: string }>('select auth.uid() as uid')).rows[0].uid,
    )
    expect(uid).toBe(id)
  })

  it('RLS가 켜진 표는 정책이 없으면 authenticated에게 안 보인다', async () => {
    const db = await open()
    await db.exec(`
      create table public.rls_probe (id int);
      insert into public.rls_probe values (1);
      alter table public.rls_probe enable row level security;
    `)
    const rows = await asUser(db, '00000000-0000-0000-0000-0000000000aa', async () =>
      (await db.query('select * from public.rls_probe')).rows,
    )
    expect(rows).toHaveLength(0)
  })

  it('anon으로 전환하면 auth.uid()가 null이다', async () => {
    const db = await open()
    const uid = await asUser(db, null, async () =>
      (await db.query<{ uid: string | null }>('select auth.uid() as uid')).rows[0].uid,
    )
    expect(uid).toBeNull()
  })

  it('asUser가 끝나면 역할과 auth.uid()가 원래대로 돌아온다', async () => {
    const db = await open()
    const id = '00000000-0000-0000-0000-0000000000aa'
    await asUser(db, id, async () => undefined)
    const uid = (await db.query<{ uid: string | null }>('select auth.uid() as uid')).rows[0].uid
    const role = (await db.query<{ u: string }>('select current_user as u')).rows[0].u
    expect(uid).toBeNull()
    expect(role).not.toBe('authenticated')
  })
})

describe('견본 복제', () => {
  it('한 DB를 고쳐도 다른 DB에는 영향이 없다', async () => {
    const a = await open()
    const b = await open()
    await a.exec(`create table public.clone_probe (id int)`)
    const { rows } = await b.query(`select to_regclass('public.clone_probe') as t`)
    expect(rows[0]).toEqual({ t: null })
  })
})
