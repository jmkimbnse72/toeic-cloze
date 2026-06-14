import { db, type Deck, type Card } from './schema'
import seedJson from '../data/toeic_decks.json'

interface SeedCard {
  id: string
  en: string
  ko: string
  tags?: string[]
  fix?: string
  review?: boolean
}
interface SeedDeck {
  id: string
  name: string
  date?: string
  cards: SeedCard[]
}
interface SeedFile {
  meta: { title: string; type: string; totalDays: number; note?: string }
  decks: SeedDeck[]
}

const seed = seedJson as unknown as SeedFile

const SEED_VERSION = 1 // 시드 데이터가 바뀌면 올림 → 재적재

/**
 * 첫 실행 시 교정 완료된 토익 표현집을 IndexedDB에 적재한다.
 * 이미 같은 버전으로 적재됐다면 건너뛴다(사용자 학습기록은 보존).
 */
export async function ensureSeeded(): Promise<void> {
  const flag = await db.settings.get('seedVersion')
  if (flag && flag.value === SEED_VERSION) return

  await db.transaction('rw', db.decks, db.cards, db.settings, async () => {
    const decks: Deck[] = []
    const cards: Card[] = []

    seed.decks.forEach((d, deckIndex) => {
      decks.push({
        id: d.id,
        name: d.name,
        date: d.date,
        order: deckIndex + 1,
        cardCount: d.cards.length,
      })
      d.cards.forEach((c, cardIndex) => {
        cards.push({
          id: c.id,
          deckId: d.id,
          en: c.en,
          ko: c.ko,
          tags: c.tags ?? [],
          order: cardIndex + 1,
        })
      })
    })

    // bulkPut = 기존 카드 내용은 갱신, 신규는 추가 (학습기록 테이블은 손대지 않음)
    await db.decks.bulkPut(decks)
    await db.cards.bulkPut(cards)
    await db.settings.put({ key: 'seedVersion', value: SEED_VERSION })
    await db.settings.put({ key: 'seedTitle', value: seed.meta.title })
  })
}

export const seedMeta = seed.meta
