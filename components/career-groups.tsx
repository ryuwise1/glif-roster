import { careerPeriod, type Career, type CareerGroup } from '@/lib/roster'
import { normCompany } from '@/lib/companies'
import { Badge } from '@/components/shell'
import { CompanyLogo } from '@/components/company-logo'

// LinkedIn 경력처럼 회사마다 로고와 함께 한 덩어리로 보여 준다.
// 같은 회사에서 여러 번 일했으면 회사 이름 아래에 직책을 선으로 이어 쌓는다.
export function CareerGroups({ groups, logos, today }: { groups: CareerGroup[]; logos: Map<string, string>; today: string }) {
  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {groups.map((g) => (
          <CareerGroupItem key={g.careers[0].id} group={g} domain={logos.get(normCompany(g.company)) ?? null} today={today} />
        ))}
      </ul>
      {/* logo.dev 무료 요금제는 출처 표기가 조건이다 */}
      {process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN && (
        <p className="mt-2 text-right text-[11px] text-muted">
          <a href="https://logo.dev" target="_blank" rel="noreferrer" className="hover:underline">Logos provided by Logo.dev</a>
        </p>
      )}
    </>
  )
}

function CareerGroupItem({ group, domain, today }: { group: CareerGroup; domain: string | null; today: string }) {
  const [only] = group.careers
  const single = group.careers.length === 1
  return (
    <li className="flex gap-4 py-4">
      <CompanyLogo company={group.company} domain={domain} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
          {group.company}
          {single && only.kind !== '정규' && <Badge>{only.kind}</Badge>}
        </p>
        {single ? (
          <CareerLines c={only} today={today} />
        ) : (
          <>
            {group.span && <p className="text-sm text-slate">{group.span}</p>}
            <ol className="mt-2 space-y-4 border-l-2 border-line pl-4">
              {group.careers.map((c) => (
                <li key={c.id} className="relative">
                  <span aria-hidden className="absolute -left-[1.3rem] top-1.5 size-2 rounded-full bg-muted" />
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                    {[c.team, c.title].filter(Boolean).join(' · ') || '직책 미입력'}
                    {c.kind !== '정규' && <Badge>{c.kind}</Badge>}
                  </p>
                  <CareerLines c={c} today={today} hideRole />
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </li>
  )
}

function CareerLines({ c, today, hideRole }: { c: Career; today: string; hideRole?: boolean }) {
  const period = careerPeriod(c, today)
  return (
    <>
      {!hideRole && (c.team || c.title) && <p className="text-sm text-ink">{[c.team, c.title].filter(Boolean).join(' · ')}</p>}
      {period && <p className="text-sm text-muted">{period}</p>}
      {(c.industry || c.job_function || c.region) && (
        <p className="mt-1 text-xs text-slate">{[c.industry, c.job_function, c.region].filter(Boolean).join(' · ')}</p>
      )}
    </>
  )
}
