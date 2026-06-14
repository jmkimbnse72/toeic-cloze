import { db, type Card, type Review } from '../db/schema'
import { newReview } from './srs'
import { getSettings } from './settings'
import { todayNewCount } from './stats'

export interface DeckView {
  id: string
  name: string
  date?: string
  order: number
  total: number
  studied: number
  due: number
}

export const FIELD_TAG = '현장영어'

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) =>
    a.deckId === b.deckId ? a.order - b.order : a.deckId.localeCompare(b.deckId),
  )
}

/** 틀린 적 있는(다시를 누른) 카드 id */
export async function getWeakCardIds(): Promise<string[]> {
  const rs = await db.reviews.filter((r) => r.lapses > 0).toArray()
  return rs.map((r) => r.cardId)
}

/** deckId → 카드 목록
 *  'all' 전체 · 'field' 현장영어 · 'weak' 약점 · 'marked' 북마크 · 그 외 Day 덱 */
export async function getCardsForDeck(deckId: string): Promise<Card[]> {
  if (deckId === 'all') return sortCards(await db.cards.toArray())
  if (deckId === 'field')
    return sortCards(await db.cards.where('tags').equals(FIELD_TAG).toArray())
  if (deckId === 'weak') {
    const ids = await getWeakCardIds()
    return sortCards(await db.cards.where('id').anyOf(ids).toArray())
  }
  if (deckId === 'marked') {
    const ids = (await db.bookmarks.toArray()).map((b) => b.cardId)
    return sortCards(await db.cards.where('id').anyOf(ids).toArray())
  }
  return db.cards.where('deckId').equals(deckId).sortBy('order')
}

/** Day 덱 목록 + 학습/복습 통계 */
export async function listDecks(): Promise<DeckView[]> {
  const decks = await db.decks.orderBy('order').toArray()
  const now = Date.now()
  const out: DeckView[] = []
  for (const d of decks) {
    const ids = (await db.cards
      .where('deckId')
      .equals(d.id)
      .primaryKeys()) as string[]
    const reviews = await db.reviews.where('cardId').anyOf(ids).toArray()
    out.push({
      id: d.id,
      name: d.name,
      date: d.date,
      order: d.order,
      total: ids.length,
      studied: reviews.length,
      due: reviews.filter((r) => r.due <= now).length,
    })
  }
  return out
}

/** 전체/현장영어 같은 스마트 덱의 통계 */
export async function smartStat(deckId: string): Promise<DeckView> {
  const cards = await getCardsForDeck(deckId)
  const ids = cards.map((c) => c.id)
  const now = Date.now()
  const reviews = await db.reviews.where('cardId').anyOf(ids).toArray()
  return {
    id: deckId,
    name: deckId === 'field' ? '현장영어' : '전체',
    order: 0,
    total: ids.length,
    studied: reviews.length,
    due: reviews.filter((r) => r.due <= now).length,
  }
}

export interface QueueItem {
  card: Card
  review: Review
  isNew: boolean
}

/**
 * 집중 학습 큐: 복습 예정(due) 카드를 먼저, 그다음 미학습(new) 카드.
 * limit 만큼 잘라서 반환.
 */
export async function getSessionQueue(
  deckId: string,
  limit = 20,
): Promise<QueueItem[]> {
  const cards = await getCardsForDeck(deckId)
  const reviews = await db.reviews
    .where('cardId')
    .anyOf(cards.map((c) => c.id))
    .toArray()
  const rmap = new Map(reviews.map((r) => [r.cardId, r]))
  const now = Date.now()

  // 약점·북마크 집중: 일정과 무관하게 전부 드릴(가장 오래된 복습 먼저)
  if (deckId === 'weak' || deckId === 'marked') {
    const items: QueueItem[] = cards.map((card) => {
      const r = rmap.get(card.id)
      return r
        ? { card, review: r, isNew: false }
        : { card, review: newReview(card.id), isNew: true }
    })
    items.sort((a, b) => a.review.due - b.review.due)
    return items.slice(0, limit)
  }

  // 일반 덱: 복습 예정(due) 먼저, 그다음 미학습(new) — 일일 신규 한도 적용
  const due: QueueItem[] = []
  const fresh: QueueItem[] = []
  for (const card of cards) {
    const r = rmap.get(card.id)
    if (!r) fresh.push({ card, review: newReview(card.id), isNew: true })
    else if (r.due <= now) due.push({ card, review: r, isNew: false })
  }
  const remainingNew = Math.max(0, getSettings().dailyNew - (await todayNewCount()))
  return [...due, ...fresh.slice(0, remainingNew)].slice(0, limit)
}
