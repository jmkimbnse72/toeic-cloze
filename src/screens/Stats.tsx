import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import {
  getStreak,
  recentActivity,
  getMaturity,
  dateStr,
  type Maturity,
} from '../lib/stats'
import { getWeakCardIds } from '../lib/queries'
import { TopBar } from '../components/ui'
import { Flame } from '../components/icons'

const SEGMENTS: { key: keyof Maturity; label: string; color: string }[] = [
  { key: 'fresh', label: '신규', color: 'var(--border)' },
  { key: 'learning', label: '학습중', color: 'var(--amber)' },
  { key: 'young', label: '복습', color: 'color-mix(in srgb, var(--accent) 55%, var(--bg))' },
  { key: 'mature', label: '숙련', color: 'var(--accent)' },
]

export default function Stats({ back }: { back: () => void }) {
  const data = useLiveQuery(async () => {
    const today = (await db.activity.get(dateStr())) ?? {
      date: dateStr(),
      studied: 0,
      again: 0,
      newIntroduced: 0,
    }
    const [streak, recent, maturity, weak] = await Promise.all([
      getStreak(),
      recentActivity(14),
      getMaturity(),
      getWeakCardIds(),
    ])
    return { today, streak, recent, maturity, weak: weak.length }
  }, [])

  if (!data) {
    return (
      <div className="mx-auto min-h-dvh max-w-reading px-5 sm:px-7">
        <TopBar title="통계" onBack={back} />
        <p className="mt-24 text-center text-sm text-ink-3">불러오는 중…</p>
      </div>
    )
  }

  const { today, streak, recent, maturity, weak } = data
  const accuracy =
    today.studied > 0 ? Math.round(((today.studied - today.again) / today.studied) * 100) : null
  const maxStudied = Math.max(1, ...recent.map((r) => r.studied))
  const studiedTotal = maturity.total - maturity.fresh

  return (
    <div className="mx-auto min-h-dvh max-w-reading px-5 pb-16 sm:px-7">
      <TopBar title="통계" onBack={back} />

      {/* 스트릭 */}
      <div className="mt-3 flex items-center gap-4 rounded-card bg-accent px-6 py-5 text-white shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
          <Flame size={24} />
        </div>
        <div>
          <p className="font-display text-3xl font-bold leading-none tabular-nums">
            {streak}
            <span className="ml-1 text-lg font-medium">일</span>
          </p>
          <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-white/80">
            연속 학습
          </p>
        </div>
      </div>

      {/* 오늘 */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat value={today.studied} label="오늘 학습" />
        <Stat value={accuracy === null ? '—' : `${accuracy}%`} label="오늘 정답률" />
        <Stat value={weak} label="약점" tone={weak > 0 ? 'danger' : undefined} />
      </div>

      {/* 최근 14일 */}
      <p className="eyebrow mt-9">최근 14일</p>
      <div className="mt-3 flex h-24 items-end justify-between gap-1.5 rounded-card border border-border bg-surface px-4 py-3">
        {recent.map((r) => {
          const isToday = r.date === dateStr()
          return (
            <div key={r.date} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-sm transition-all"
                style={{
                  height: `${(r.studied / maxStudied) * 100}%`,
                  minHeight: r.studied > 0 ? '4px' : '2px',
                  background: r.studied > 0 ? 'var(--accent)' : 'var(--border)',
                  opacity: isToday ? 1 : r.studied > 0 ? 0.85 : 0.5,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* 성숙도 */}
      <p className="eyebrow mt-9">학습 진행 · {studiedTotal}/{maturity.total}</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-2">
        {SEGMENTS.map((s) => {
          const v = maturity[s.key]
          if (!v) return null
          return (
            <div
              key={s.key}
              style={{ width: `${(v / maturity.total) * 100}%`, background: s.color }}
            />
          )
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-sm text-ink-2">{s.label}</span>
            <span className="ml-auto font-mono text-sm tabular-nums text-ink">
              {maturity[s.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number | string
  label: string
  tone?: 'danger'
}) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center">
      <p
        className={`font-display text-2xl font-semibold tabular-nums ${
          tone === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="eyebrow mt-1">{label}</p>
    </div>
  )
}
