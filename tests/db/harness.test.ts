import { describe, expect, it } from 'vitest'
import { asUser, createDb } from './harness'

describe('DB 테스트 환경', () => {
  it('authenticated로 전환하면 auth.uid()가 그 사용자다', async () => {
    const db = await createDb()
    const id = '00000000-0000-0000-0000-0000000000aa'
    const uid = await asUser(db, id, async () =>
      (await db.query<{ uid: string }>('select auth.uid() as uid')).rows[0].uid,
    )
    expect(uid).toBe(id)
  })

  it('RLS가 켜진 표는 정책이 없으면 authenticated에게 안 보인다', async () => {
    const db = await createDb()
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
    const db = await createDb()
    const uid = await asUser(db, null, async () =>
      (await db.query<{ uid: string | null }>('select auth.uid() as uid')).rows[0].uid,
    )
    expect(uid).toBeNull()
  })

  it('asUser가 끝나면 역할과 auth.uid()가 원래대로 돌아온다', async () => {
    const db = await createDb()
    const id = '00000000-0000-0000-0000-0000000000aa'
    await asUser(db, id, async () => undefined)
    const uid = (await db.query<{ uid: string | null }>('select auth.uid() as uid')).rows[0].uid
    const role = (await db.query<{ u: string }>('select current_user as u')).rows[0].u
    expect(uid).toBeNull()
    expect(role).not.toBe('authenticated')
  })
})
