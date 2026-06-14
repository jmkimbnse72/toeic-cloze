import Dexie, { type Table } from 'dexie'

// ── 도메인 타입 ───────────────────────────────────────────
export interface Deck {
  id: string
  name: string
  /** 교재 날짜 라벨, 예: "4/3" */
  date?: string
  /** 정렬 순서 (Day 1, 2, 3 …) */
  order: number
  /** 덱에 속한 카드 수 (조회 편의용 캐시) */
  cardCount: number
}

export interface Card {
  id: string
  deckId: string
  /** 영어 연어 표현 — 학습의 주인공 */
  en: string
  /** 한국어 뜻 */
  ko: string
  /** 태그, 예: ["현장영어"] */
  tags: string[]
  /** 덱 내 순서 */
  order: number
}

export type SrsState = 'new' | 'learning' | 'review'

/** SM-2 기반 카드별 복습 상태 (학습 모드 단계에서 본격 사용) */
export interface Review {
  cardId: string
  state: SrsState
  /** SM-2 ease factor (기본 2.5) */
  ease: number
  /** 복습 간격(일) */
  interval: number
  /** 누적 복습 횟수 */
  reps: number
  /** 실패(다시) 횟수 */
  lapses: number
  /** 다음 복습 예정 시각 (epoch ms) */
  due: number
  /** 마지막 복습 시각 (epoch ms) */
  lastReviewed: number | null
}

/** 단순 key-value 설정 (테마, 일일 신규 한도, 스트릭 등) */
export interface Setting {
  key: string
  value: unknown
}

/** 북마크(약점 표시) — 존재하면 표시됨 */
export interface Bookmark {
  cardId: string
  createdAt: number
}

/** 날짜별 학습 활동 (스트릭/통계용) — date: 'YYYY-MM-DD' */
export interface Activity {
  date: string
  studied: number
  again: number
  newIntroduced: number
}

/** 덱별 손글씨 메모 (벡터 스트로크) */
export interface Note {
  deckId: string
  strokes: unknown[]
  updatedAt: number
}

// ── Dexie DB ─────────────────────────────────────────────
export class ToeicDB extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  reviews!: Table<Review, string>
  settings!: Table<Setting, string>
  bookmarks!: Table<Bookmark, string>
  activity!: Table<Activity, string>
  notes!: Table<Note, string>

  constructor() {
    super('toeic-cloze')
    this.version(1).stores({
      decks: 'id, order',
      cards: 'id, deckId, *tags',
      reviews: 'cardId, state, due',
      settings: 'key',
    })
    // v2: 북마크 추가 (기존 스토어는 그대로 승계)
    this.version(2).stores({
      bookmarks: 'cardId, createdAt',
    })
    // v3: 활동 로그 추가
    this.version(3).stores({
      activity: 'date',
    })
    // v4: 덱별 메모 추가
    this.version(4).stores({
      notes: 'deckId',
    })
  }
}

export const db = new ToeicDB()
