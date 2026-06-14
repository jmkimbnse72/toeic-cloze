import { db } from '../db/schema'
import type { Grade } from './srs'

// ── 날짜 헬퍼 (로컬 기준 YYYY-MM-DD) ──────────────────────
export function dateStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 채점 결과를 오늘 활동에 기록 */
export async function recordStudy(grade: Grade, wasNew: boolean) {
  const date = dateStr()
  await db.transaction('rw', db.activity, async () => {
    const a = (await db.activity.get(date)) ?? {
      date,
      studied: 0,
      again: 0,
      newIntroduced: 0,
    }
    a.studied += 1
    if (grade === 'again') a.again += 1
    if (wasNew) a.newIntroduced += 1
    await db.activity.put(a)
  })
}

/** 오늘 신규로 학습한 카드 수 (일일 한도 계산용) */
export async function todayNewCount(): Promise<number> {
  return (await db.activity.get(dateStr()))?.newIntroduced ?? 0
}

/** 연속 학습 일수 (오늘 미학습이면 어제부터 계산해 끊기지 않게) */
export async function getStreak(): Promise<number> {
  const all = await db.activity.toArray()
  const active = new Set(all.filter((a) => a.studied > 0).map((a) => a.date))
  let day = new Date()
  if (!active.has(dateStr(day))) day = addDays(day, -1)
  let streak = 0
  while (active.has(dateStr(day))) {
    streak += 1
    day = addDays(day, -1)
  }
  return streak
}

export interface DayActivity {
  date: string
  studied: number
}
/** 최근 N일 활동 (오래된→최신) */
export async function recentActivity(days = 14): Promise<DayActivity[]> {
  const map = new Map((await db.activity.toArray()).map((a) => [a.date, a.studied]))
  const out: DayActivity[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = dateStr(addDays(new Date(), -i))
    out.push({ date: d, studied: map.get(d) ?? 0 })
  }
  return out
}

export interface Maturity {
  total: number
  fresh: number // 신규 (복습기록 없음)
  learning: number // 학습중
  young: number // 복습 (interval < 21일)
  mature: number // 숙련 (interval >= 21일)
}
export async function getMaturity(): Promise<Maturity> {
  const total = await db.cards.count()
  const reviews = await db.reviews.toArray()
  let learning = 0
  let young = 0
  let mature = 0
  for (const r of reviews) {
    if (r.state === 'learning') learning += 1
    else if (r.interval >= 21) mature += 1
    else young += 1
  }
  return { total, fresh: total - reviews.length, learning, young, mature }
}
