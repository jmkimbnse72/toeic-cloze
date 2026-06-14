import seedJson from '../data/toeic_decks.json'
import { makeCloze, isPreposition } from './cloze'

// 전치사 빈칸용 오답 풀 (헷갈리는 빈출 전치사)
const PREP_POOL = [
  'to', 'for', 'with', 'of', 'in', 'on', 'at', 'from', 'by', 'about',
  'into', 'over', 'as', 'within', 'through', 'against', 'under',
]

// 내용어(동사 등) 빈칸용 오답 풀 — 시드 전체에서 추출
let contentPool: string[] | null = null
function getContentPool(): string[] {
  if (contentPool) return contentPool
  const set = new Set<string>()
  const seed = seedJson as unknown as { decks: { cards: { en: string }[] }[] }
  for (const d of seed.decks)
    for (const c of d.cards) {
      const cl = makeCloze(c.en)
      if (cl && !isPreposition(cl.answer) && cl.answer.length > 2) set.add(cl.answer)
    }
  contentPool = [...set]
  return contentPool
}

// 문자열 → 시드 (카드마다 보기/순서를 고정)
function hash(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffleSeeded<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface Choices {
  options: string[]
  correctIndex: number
}

/** 정답 + 오답 3개 → 보기 4개 (카드 seed로 고정) */
export function makeChoices(answer: string, seed: string): Choices {
  const rnd = mulberry32(hash(seed + answer))
  const pool = (isPreposition(answer) ? PREP_POOL : getContentPool()).filter(
    (w) => w !== answer,
  )
  const distractors = shuffleSeeded(pool, rnd).slice(0, 3)
  const options = shuffleSeeded([answer, ...distractors], rnd)
  return { options, correctIndex: options.indexOf(answer) }
}
