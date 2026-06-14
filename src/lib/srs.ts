import type { Review, SrsState } from '../db/schema'

/** 사용자가 카드를 평가하는 4단계 (Anki식) */
export type Grade = 'again' | 'hard' | 'good' | 'easy'

const DAY = 24 * 60 * 60 * 1000
const MIN_EASE = 1.3

/** 신규 카드의 초기 복습 상태 */
export function newReview(cardId: string, now = Date.now()): Review {
  return {
    cardId,
    state: 'new',
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: now,
    lastReviewed: null,
  }
}

/**
 * SM-2 변형: 평가에 따라 다음 간격/ease/due를 계산한다.
 * - again: 실패 → learning 단계로, 짧게 다시
 * - hard/good/easy: 간격을 점증, ease 보정
 */
export function schedule(prev: Review, grade: Grade, now = Date.now()): Review {
  let { ease, interval, reps, lapses } = prev
  let state: SrsState = prev.state

  if (grade === 'again') {
    lapses += 1
    reps = 0
    ease = Math.max(MIN_EASE, ease - 0.2)
    interval = 0
    state = 'learning'
    return { ...prev, state, ease, interval, reps, lapses, due: now + 1 * 60 * 1000, lastReviewed: now }
  }

  // ease 보정
  if (grade === 'hard') ease = Math.max(MIN_EASE, ease - 0.15)
  if (grade === 'easy') ease = ease + 0.15

  reps += 1

  if (reps === 1) {
    interval = grade === 'easy' ? 4 : 1
  } else if (reps === 2) {
    interval = grade === 'hard' ? 3 : 6
  } else {
    const mult = grade === 'hard' ? 1.2 : grade === 'easy' ? ease * 1.3 : ease
    interval = Math.round(interval * mult)
  }
  interval = Math.max(1, interval)
  state = 'review'

  return {
    ...prev,
    state,
    ease,
    interval,
    reps,
    lapses,
    due: now + interval * DAY,
    lastReviewed: now,
  }
}

/** 화면 표시용 — 다음 복습까지 간격을 사람이 읽는 라벨로 */
export function intervalLabel(grade: Grade, prev: Review): string {
  const next = schedule(prev, grade)
  if (next.interval === 0) return '1분'
  if (next.interval === 1) return '1일'
  if (next.interval < 30) return `${next.interval}일`
  const months = Math.round(next.interval / 30)
  return `${months}개월`
}
