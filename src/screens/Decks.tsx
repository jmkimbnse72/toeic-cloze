import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { listDecks, smartStat, getWeakCardIds } from '../lib/queries'
import { useTheme } from '../lib/useTheme'
import { useInstall } from '../lib/useInstall'
import type { Route } from '../lib/useRouter'
import { Ring } from '../components/ui'
import { Sun, Moon, ChevronRight, ArrowRight, Flame, Bookmark, Chart, Gear } from '../components/icons'

function DuePill({ n }: { n: number }) {
  if (!n) return null
  return (
    <span className="rounded-full bg-accent-weak px-2 py-0.5 font-mono text-[0.68rem] font-medium text-accent">
      복습 {n}
    </span>
  )
}

export default function Decks({ go }: { go: (r: Route) => void }) {
  const { theme, toggle } = useTheme()
  const { installed, isIOS, canPrompt, promptInstall } = useInstall()

  const data = useLiveQuery(async () => {
    const [decks, all, field] = await Promise.all([
      listDecks(),
      smartStat('all'),
      smartStat('field'),
    ])
    const weak = (await getWeakCardIds()).length
    const marked = await db.bookmarks.count()
    const dueTotal = decks.reduce((s, d) => s + d.due, 0)
    return { decks, all, field, weak, marked, dueTotal }
  }, [])

  const ready = !!data

  return (
    <div className="mx-auto min-h-dvh max-w-reading px-5 pb-24 pt-7 sm:px-7">
      <header className="flex items-start justify-between">
        <div>
          <span className="eyebrow">TOEIC · Collocation</span>
          <h1 className="mt-1 font-display text-[2.3rem] font-bold leading-none tracking-tight text-ink">
            토익 연어
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go({ name: 'stats' })}
            aria-label="통계"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition-colors hover:text-ink active:scale-95"
          >
            <Chart size={19} />
          </button>
          <button
            onClick={() => go({ name: 'settings' })}
            aria-label="설정"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition-colors hover:text-ink active:scale-95"
          >
            <Gear size={19} />
          </button>
          <button
            onClick={toggle}
            aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition-colors hover:text-ink active:scale-95"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* 오늘 학습 — 히어로 */}
      <button
        onClick={() => go({ name: 'session', deckId: 'all' })}
        className="mt-7 flex w-full items-center gap-4 rounded-card bg-accent px-6 py-5 text-left text-white shadow-card transition-transform active:scale-[0.99]"
      >
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-white/80">
            <Flame size={15} />
            <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.16em]">
              오늘 학습
            </span>
          </div>
          <p className="mt-1.5 font-display text-xl font-semibold">
            {ready
              ? data!.dueTotal > 0
                ? `복습 ${data!.dueTotal}장 + 신규`
                : '새 표현 학습하기'
              : '불러오는 중…'}
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <ArrowRight size={20} />
        </span>
      </button>

      {/* 약점 집중 */}
      <div className="mt-8 flex items-baseline justify-between">
        <span className="eyebrow">약점 집중</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <PersonalCard
          tone="danger"
          icon={<Flame size={18} />}
          count={ready ? data!.weak : 0}
          label="약점 · 틀린 카드"
          ready={ready}
          onClick={() => go({ name: 'browse', deckId: 'weak' })}
        />
        <PersonalCard
          tone="amber"
          icon={<Bookmark size={17} filled />}
          count={ready ? data!.marked : 0}
          label="북마크"
          ready={ready}
          onClick={() => go({ name: 'browse', deckId: 'marked' })}
        />
      </div>

      {/* 콘텐츠 덱 */}
      <div className="mt-8 flex items-baseline justify-between">
        <span className="eyebrow">콘텐츠</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SmartCard
          label="전체"
          sub={ready ? `${data!.all.total} 표현` : ''}
          value={ready ? data!.all.studied : 0}
          total={ready ? data!.all.total : 0}
          onClick={() => go({ name: 'browse', deckId: 'all' })}
        />
        <SmartCard
          label="현장영어"
          sub={ready ? `${data!.field.total} 표현` : ''}
          value={ready ? data!.field.studied : 0}
          total={ready ? data!.field.total : 0}
          onClick={() => go({ name: 'browse', deckId: 'field' })}
        />
      </div>

      {/* Day 목록 */}
      <div className="mt-8 flex items-baseline justify-between">
        <span className="eyebrow">Days · 교재 일차</span>
        <span className="eyebrow text-ink-3">20</span>
      </div>
      <ul className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
        {(data?.decks ?? []).map((d, i) => (
          <li key={d.id}>
            {i > 0 && <div className="ml-[4.5rem] h-px bg-border" />}
            <button
              onClick={() => go({ name: 'browse', deckId: d.id })}
              className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/50 active:bg-surface-2"
            >
              <Ring value={d.studied} total={d.total} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-[0.98rem] font-semibold text-ink">
                    {d.name}
                  </span>
                  {d.date && (
                    <span className="font-mono text-xs text-ink-3">{d.date}</span>
                  )}
                </div>
                <span className="font-mono text-[0.7rem] text-ink-3">
                  {d.studied}/{d.total}
                </span>
              </div>
              <DuePill n={d.due} />
              <ChevronRight className="text-ink-3" size={18} />
            </button>
          </li>
        ))}
        {!ready &&
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-[60px] animate-pulse border-t border-border first:border-0" />
          ))}
      </ul>

      {!installed && (
        <div className="mt-6 text-center text-sm text-ink-3">
          {canPrompt ? (
            <button onClick={promptInstall} className="text-accent underline-offset-4 hover:underline">
              홈 화면에 앱으로 설치
            </button>
          ) : isIOS ? (
            <span>
              설치: 사파리 <span className="text-ink-2">공유</span> →{' '}
              <span className="text-ink-2">홈 화면에 추가</span>
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PersonalCard({
  tone,
  icon,
  count,
  label,
  ready,
  onClick,
}: {
  tone: 'danger' | 'amber'
  icon: ReactNode
  count: number
  label: string
  ready: boolean
  onClick: () => void
}) {
  const chip = tone === 'danger' ? 'bg-danger-weak text-danger' : 'bg-amber-weak text-amber'
  const dim = ready && count === 0
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-4 text-left transition-colors hover:bg-surface-2/50 active:scale-[0.99] ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-semibold tabular-nums leading-none text-ink">
          {ready ? count : '—'}
        </p>
        <p className="mt-1 font-mono text-[0.66rem] leading-tight text-ink-3">{label}</p>
      </div>
    </button>
  )
}

function SmartCard({
  label,
  sub,
  value,
  total,
  onClick,
}: {
  label: string
  sub: string
  value: number
  total: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-4 text-left transition-colors hover:bg-surface-2/50 active:scale-[0.99]"
    >
      <Ring value={value} total={total} size={34} />
      <div>
        <p className="font-display text-[0.95rem] font-semibold text-ink">{label}</p>
        <p className="font-mono text-[0.68rem] text-ink-3">{sub}</p>
      </div>
    </button>
  )
}
