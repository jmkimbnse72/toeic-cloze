import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Card } from '../db/schema'
import { getCardsForDeck, FIELD_TAG } from '../lib/queries'
import { toggleBookmark } from '../lib/bookmarks'
import { speak } from '../lib/tts'
import type { Route } from '../lib/useRouter'
import { TopBar, Segmented, RevealBlank, FieldChip } from '../components/ui'
import { Bookmark, Speaker, Shuffle, ArrowRight, Notebook } from '../components/icons'
import NoteCanvas from '../components/NoteCanvas'

type Mode = 'both' | 'expr' | 'mean'
const MODES: { value: Mode; label: string }[] = [
  { value: 'both', label: '표현·뜻' },
  { value: 'expr', label: '표현만' },
  { value: 'mean', label: '뜻만' },
]

function shuffleArr<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export default function Browse({
  deckId,
  title,
  go,
  back,
}: {
  deckId: string
  title: string
  go: (r: Route) => void
  back: () => void
}) {
  const [mode, setMode] = useState<Mode>('both')
  const [shuffled, setShuffled] = useState(false)
  const [onlyMarked, setOnlyMarked] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [noteOpen, setNoteOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  )

  const cards = useLiveQuery(() => getCardsForDeck(deckId), [deckId])
  const markSet = useLiveQuery(
    async () => new Set((await db.bookmarks.toArray()).map((b) => b.cardId)),
    [],
  )

  useEffect(() => setRevealed(new Set()), [mode, deckId])

  const list = useMemo(() => {
    let l = cards ?? []
    if (onlyMarked && markSet) l = l.filter((c) => markSet.has(c.id))
    return shuffled ? shuffleArr(l) : l
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, onlyMarked, markSet, shuffled])

  const reveal = (id: string) => setRevealed((s) => new Set(s).add(id))

  const iconBtn =
    'flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition-colors active:scale-95'

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* 단어장 컬럼 */}
      <section
        className={`flex h-full flex-col overflow-hidden ${
          noteOpen ? 'w-full md:w-[420px] md:shrink-0' : 'mx-auto w-full max-w-reading'
        }`}
      >
        <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-7">
          <TopBar
            title={title}
            onBack={back}
            right={
              <>
                <button
                  aria-label="섞기"
                  onClick={() => setShuffled((v) => !v)}
                  className={`${iconBtn} ${shuffled ? 'border-accent text-accent' : ''}`}
                >
                  <Shuffle size={18} />
                </button>
                <button
                  aria-label="북마크만 보기"
                  onClick={() => setOnlyMarked((v) => !v)}
                  className={`${iconBtn} ${onlyMarked ? 'border-amber text-amber' : ''}`}
                >
                  <Bookmark size={18} filled={onlyMarked} />
                </button>
                <button
                  aria-label="메모"
                  onClick={() => setNoteOpen((v) => !v)}
                  className={`${iconBtn} ${noteOpen ? 'border-accent text-accent' : ''}`}
                >
                  <Notebook size={18} />
                </button>
              </>
            }
          />

          <div className="mt-3">
            <Segmented value={mode} options={MODES} onChange={setMode} />
          </div>
          <p className="mt-3 px-1 font-mono text-[0.7rem] text-ink-3">
            {list.length}개{mode !== 'both' && ' · 빈칸을 탭하면 확인'}
          </p>

          <ul className="mt-2 overflow-hidden rounded-card border border-border bg-surface">
            {list.map((c, i) => (
              <Row
                key={c.id}
                card={c}
                mode={mode}
                first={i === 0}
                marked={!!markSet?.has(c.id)}
                revealed={revealed.has(c.id)}
                onReveal={() => reveal(c.id)}
              />
            ))}
            {list.length === 0 && (
              <li className="px-5 py-12 text-center text-sm text-ink-3">
                {onlyMarked || deckId === 'marked'
                  ? '북마크한 표현이 없어요'
                  : deckId === 'weak'
                    ? '아직 틀린 표현이 없어요'
                    : '표현이 없습니다'}
              </li>
            )}
          </ul>
        </div>

        {/* 집중 학습 시작 */}
        <div className="shrink-0 border-t border-border bg-bg px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
          <button
            onClick={() => go({ name: 'session', deckId })}
            className="flex w-full items-center justify-center gap-2 rounded-card bg-accent py-3.5 font-medium text-white transition-transform active:scale-[0.99]"
          >
            집중 학습 시작
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* 메모 패널 */}
      {noteOpen && <NoteCanvas deckId={deckId} onClose={() => setNoteOpen(false)} />}
    </div>
  )
}

function Row({
  card,
  mode,
  first,
  marked,
  revealed,
  onReveal,
}: {
  card: Card
  mode: Mode
  first: boolean
  marked: boolean
  revealed: boolean
  onReveal: () => void
}) {
  const isField = card.tags.includes(FIELD_TAG)
  return (
    <li className={first ? '' : 'border-t border-border'}>
      <div className="flex items-center gap-3 px-3 py-3.5">
        <button
          aria-label="북마크"
          onClick={() => toggleBookmark(card.id)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90 ${
            marked ? 'bg-amber text-white' : 'bg-surface-2 text-ink-3'
          }`}
        >
          <Bookmark size={16} filled={marked} />
        </button>

        <div className="min-w-0 flex-1">
          {mode === 'mean' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-sans text-[0.95rem] font-medium text-ink">{card.ko}</span>
                {isField && <FieldChip />}
              </div>
              <div className="mt-1">
                <RevealBlank revealed={revealed} onReveal={onReveal}>
                  <span className="font-display text-[1.05rem] text-accent">{card.en}</span>
                </RevealBlank>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-display text-[1.05rem] font-medium leading-snug text-ink">
                  {card.en}
                </span>
                {isField && <FieldChip />}
              </div>
              <div className="mt-1">
                {mode === 'both' ? (
                  <span className="text-[0.9rem] text-ink-2">{card.ko}</span>
                ) : (
                  <RevealBlank revealed={revealed} onReveal={onReveal}>
                    <span className="text-[0.9rem] text-ink-2">{card.ko}</span>
                  </RevealBlank>
                )}
              </div>
            </>
          )}
        </div>

        <button
          aria-label="발음 듣기"
          onClick={() => speak(card.en)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-accent active:scale-90"
        >
          <Speaker size={19} />
        </button>
      </div>
    </li>
  )
}
