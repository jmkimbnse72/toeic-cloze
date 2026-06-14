import type { ReactNode } from 'react'
import { ChevronLeft } from './icons'

// ── 상단바 ───────────────────────────────────────────────
export function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 -mx-5 mb-2 flex h-14 items-center gap-2 border-b border-border/70 bg-bg/85 px-5 backdrop-blur-md sm:-mx-7 sm:px-7">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="뒤로"
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink active:scale-95"
        >
          <ChevronLeft />
        </button>
      )}
      {title && (
        <h1 className="font-display text-base font-semibold tracking-tight text-ink">
          {title}
        </h1>
      )}
      <div className="ml-auto flex items-center gap-1">{right}</div>
    </header>
  )
}

// ── 세그먼트 컨트롤 ────────────────────────────────────────
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-full border border-border bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-center font-mono text-[0.78rem] font-medium tracking-tight transition-colors ${
              active
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── 진도 링 ───────────────────────────────────────────────
export function Ring({
  value,
  total,
  size = 38,
}: {
  value: number
  total: number
  size?: number
}) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const pct = total ? value / total : 0
  const done = total > 0 && value >= total
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset .4s ease' }}
      />
      {done && (
        <path
          d={`M${size / 2 - 5} ${size / 2 + 0.5} l3.5 3.5 l6 -7`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  )
}

// ── 시그니처: 제도 양식의 빈칸(밑줄칸) ─────────────────────
export function RevealBlank({
  revealed,
  children,
  onReveal,
  big,
}: {
  revealed: boolean
  children: ReactNode
  onReveal: () => void
  big?: boolean
}) {
  if (revealed) {
    return <div className={big ? 'leading-snug' : ''}>{children}</div>
  }
  return (
    <button
      onClick={onReveal}
      className={`group flex w-full items-end justify-center border-b-2 border-dashed border-border pb-1 text-center transition-colors hover:border-accent ${
        big ? 'h-9' : 'h-7'
      }`}
      aria-label="탭하여 확인"
    >
      <span className="font-mono text-sm text-ink-3 transition-colors group-hover:text-accent">
        ?
      </span>
    </button>
  )
}

// ── 현장영어 칩 ───────────────────────────────────────────
export function FieldChip() {
  return (
    <span className="rounded-md bg-accent-weak px-1.5 py-0.5 font-mono text-[0.62rem] font-medium uppercase tracking-wider text-accent">
      현장
    </span>
  )
}
