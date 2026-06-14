import { useEffect, useRef, useState, type ReactNode } from 'react'
import { db } from '../db/schema'
import { getSessionQueue, type QueueItem, FIELD_TAG } from '../lib/queries'
import { schedule, intervalLabel, type Grade } from '../lib/srs'
import { makeCloze, checkAnswer, type Cloze } from '../lib/cloze'
import { makeChoices, type Choices } from '../lib/choices'
import { recordStudy } from '../lib/stats'
import { speak } from '../lib/tts'
import { TopBar, Segmented, FieldChip } from '../components/ui'
import { Speaker } from '../components/icons'

type StudyMode = 'cloze' | 'mc' | 'recall'
type Dir = 'ko2en' | 'en2ko'

const MODES: { value: StudyMode; label: string }[] = [
  { value: 'cloze', label: '빈칸' },
  { value: 'mc', label: '4지선다' },
  { value: 'recall', label: '뒤집기' },
]
const DIRS: { value: Dir; label: string }[] = [
  { value: 'ko2en', label: '뜻 → 표현' },
  { value: 'en2ko', label: '표현 → 뜻' },
]
const GRADES: { g: Grade; label: string; tone: string }[] = [
  { g: 'again', label: '다시', tone: 'danger' },
  { g: 'hard', label: '어려움', tone: 'muted' },
  { g: 'good', label: '알맞음', tone: 'accent' },
  { g: 'easy', label: '쉬움', tone: 'muted' },
]

export default function Session({
  deckId,
  title,
  back,
}: {
  deckId: string
  title: string
  back: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [i, setI] = useState(0)
  const [mode, setMode] = useState<StudyMode>('cloze')
  const [dir, setDir] = useState<Dir>('ko2en')
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState({ studied: 0, again: 0 })

  useEffect(() => {
    getSessionQueue(deckId, 20).then(setQueue)
  }, [deckId])

  function resetCard() {
    setTyped('')
    setChecked(false)
    setPicked(null)
    setRevealed(false)
  }

  if (!queue) {
    return (
      <div className="mx-auto min-h-dvh max-w-reading px-5 sm:px-7">
        <TopBar title={title} onBack={back} />
        <p className="mt-24 text-center text-sm text-ink-3">불러오는 중…</p>
      </div>
    )
  }

  if (queue.length === 0 || i >= queue.length) {
    const empty = queue.length === 0
    return (
      <div className="mx-auto flex min-h-dvh max-w-reading flex-col px-5 sm:px-7">
        <TopBar title={title} onBack={back} />
        <div className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-weak font-display text-2xl text-accent">
            {empty ? '✓' : done.studied}
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink">
            {empty ? '복습할 카드가 없어요' : '학습 완료'}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            {empty
              ? '예정된 복습이 없습니다. 다른 덱을 둘러보세요.'
              : `${done.studied}장 학습 · 다시 ${done.again}장`}
          </p>
          <button
            onClick={back}
            className="mt-7 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition-transform active:scale-95"
          >
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  const item = queue[i]
  const { card } = item
  const isField = card.tags.includes(FIELD_TAG)
  const cl = mode === 'cloze' || mode === 'mc' ? makeCloze(card.en) : null
  const choices = mode === 'mc' && cl ? makeChoices(cl.answer, card.id) : null

  const answeredCloze = mode === 'cloze' && !!cl && checked
  const answeredMc = mode === 'mc' && !!cl && picked !== null
  const answeredFallback =
    (mode === 'recall' || ((mode === 'cloze' || mode === 'mc') && !cl)) && revealed
  const answered = answeredCloze || answeredMc || answeredFallback
  const graded = answeredCloze || answeredMc
  const correct = answeredCloze
    ? checkAnswer(typed, cl!.answer)
    : answeredMc
      ? picked === choices!.correctIndex
      : true

  function grade(g: Grade) {
    db.reviews.put(schedule(item.review, g))
    recordStudy(g, item.isNew)
    setDone((d) => ({ studied: d.studied + 1, again: d.again + (g === 'again' ? 1 : 0) }))
    resetCard()
    setI((n) => n + 1)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-reading flex-col px-5 sm:px-7">
      <TopBar title={title} onBack={back} />

      <div className="mt-2 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${(i / queue.length) * 100}%` }}
          />
        </div>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          {i + 1}/{queue.length}
        </span>
      </div>

      <div className="mt-4">
        <Segmented value={mode} options={MODES} onChange={(m) => { setMode(m); resetCard() }} />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center pb-4">
        <div className="w-full rounded-card border border-border bg-surface px-6 py-9 shadow-card">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{item.isNew ? '신규' : '복습'}</span>
            {isField && <FieldChip />}
          </div>

          {mode === 'cloze' && cl ? (
            <ClozeBody
              key={card.id}
              card={card}
              cl={cl}
              typed={typed}
              setTyped={setTyped}
              checked={checked}
              onCheck={() => setChecked(true)}
            />
          ) : mode === 'mc' && cl && choices ? (
            <MCBody
              card={card}
              cl={cl}
              choices={choices}
              picked={picked}
              onPick={(idx) => setPicked(idx)}
            />
          ) : (
            <RecallBody
              card={card}
              dir={dir}
              setDir={setDir}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              noCloze={(mode === 'cloze' || mode === 'mc') && !cl}
            />
          )}
        </div>
      </div>

      <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        {answered ? (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map(({ g, label, tone }) => {
              const dim =
                graded && ((correct && g === 'again') || (!correct && (g === 'good' || g === 'easy')))
              return (
                <button
                  key={g}
                  onClick={() => grade(g)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-3 transition-transform active:scale-95 ${
                    tone === 'danger'
                      ? 'bg-danger-weak text-danger'
                      : tone === 'accent'
                        ? 'bg-accent text-white'
                        : 'bg-surface-2 text-ink-2'
                  } ${dim ? 'opacity-40' : ''}`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="font-mono text-[0.62rem] opacity-80">
                    {intervalLabel(g, item.review)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : mode === 'cloze' && cl ? (
          <button
            onClick={() => setChecked(true)}
            className="w-full rounded-card bg-accent py-4 font-medium text-white transition-transform active:scale-[0.99]"
          >
            확인
          </button>
        ) : mode === 'mc' && cl ? (
          <p className="py-4 text-center text-sm text-ink-3">정답을 고르세요</p>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            className="w-full rounded-card bg-surface-2 py-4 font-medium text-ink-2 transition-colors hover:text-ink"
          >
            정답 확인
          </button>
        )}
      </div>
    </div>
  )
}

function Expression({ cl, blankSlot }: { cl: Cloze; blankSlot: ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-end justify-center gap-x-2 gap-y-1.5">
      {cl.tokens.map((tok, idx) =>
        idx === cl.blank ? (
          <span key={idx}>{blankSlot}</span>
        ) : (
          <span key={idx} className="font-display text-[1.4rem] leading-tight text-ink">
            {tok}
          </span>
        ),
      )}
    </div>
  )
}

function ClozeBody({
  card,
  cl,
  typed,
  setTyped,
  checked,
  onCheck,
}: {
  card: { en: string; ko: string }
  cl: Cloze
  typed: string
  setTyped: (s: string) => void
  checked: boolean
  onCheck: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const correct = checkAnswer(typed, cl.answer)
  const ch = Math.max(cl.answer.length + 1, typed.length + 1, 4)

  const slot = checked ? (
    <span className="font-display text-[1.4rem] font-semibold text-accent">{cl.answer}</span>
  ) : (
    <input
      ref={ref}
      value={typed}
      onChange={(e) => setTyped(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && typed.trim()) onCheck()
      }}
      inputMode="text"
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      placeholder="?"
      style={{ width: `${ch}ch` }}
      className="border-b-2 border-accent bg-transparent pb-0.5 text-center font-mono text-[1.35rem] text-accent caret-accent outline-none placeholder:text-ink-3"
    />
  )

  return (
    <>
      <p className="mt-5 text-center text-base font-medium text-ink-2">{card.ko}</p>
      <Expression cl={cl} blankSlot={slot} />
      {checked && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {correct ? (
            <span className="text-sm font-medium text-accent">정답</span>
          ) : (
            <span className="text-sm text-ink-2">
              내 답 <span className="text-danger line-through">{typed || '—'}</span>
            </span>
          )}
          <button
            aria-label="발음 듣기"
            onClick={() => speak(card.en)}
            className="text-ink-3 transition-colors hover:text-accent"
          >
            <Speaker size={17} />
          </button>
        </div>
      )}
    </>
  )
}

function MCBody({
  card,
  cl,
  choices,
  picked,
  onPick,
}: {
  card: { en: string; ko: string }
  cl: Cloze
  choices: Choices
  picked: number | null
  onPick: (idx: number) => void
}) {
  const done = picked !== null
  const slot = (
    <span className="inline-block min-w-[3rem] border-b-2 border-dashed border-border pb-0.5 text-center font-mono text-[1.2rem] text-ink-3">
      {done ? <span className="text-accent">{cl.answer}</span> : '\u00A0'}
    </span>
  )
  return (
    <>
      <p className="mt-5 text-center text-base font-medium text-ink-2">{card.ko}</p>
      <Expression cl={cl} blankSlot={slot} />

      <div className="mt-7 grid grid-cols-2 gap-2.5">
        {choices.options.map((opt, idx) => {
          const isCorrect = idx === choices.correctIndex
          const isPicked = picked === idx
          let cls = 'border-border bg-surface-2 text-ink'
          if (done) {
            if (isCorrect) cls = 'border-accent bg-accent text-white'
            else if (isPicked) cls = 'border-danger bg-danger-weak text-danger'
            else cls = 'border-border bg-surface-2 text-ink-3 opacity-50'
          }
          return (
            <button
              key={idx}
              disabled={done}
              onClick={() => onPick(idx)}
              className={`rounded-xl border py-3.5 text-center font-mono text-[1.05rem] transition-transform active:scale-95 ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {done && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            aria-label="발음 듣기"
            onClick={() => speak(card.en)}
            className="text-ink-3 transition-colors hover:text-accent"
          >
            <Speaker size={17} />
          </button>
        </div>
      )}
    </>
  )
}

function RecallBody({
  card,
  dir,
  setDir,
  revealed,
  onReveal,
  noCloze,
}: {
  card: { en: string; ko: string }
  dir: Dir
  setDir: (d: Dir) => void
  revealed: boolean
  onReveal: () => void
  noCloze: boolean
}) {
  const prompt = dir === 'ko2en' ? card.ko : card.en
  const answer = dir === 'ko2en' ? card.en : card.ko
  const promptIsEn = dir === 'en2ko'
  return (
    <>
      {!noCloze && (
        <div className="mt-4 flex justify-center">
          <div className="w-[12rem]">
            <Segmented value={dir} options={DIRS} onChange={setDir} />
          </div>
        </div>
      )}
      <p
        className={`mt-6 text-center leading-snug text-ink ${
          promptIsEn ? 'font-display text-[1.6rem] font-medium' : 'font-sans text-2xl font-medium'
        }`}
      >
        {prompt}
      </p>
      <div className="mt-7 min-h-[3.25rem]">
        {revealed ? (
          <div className="flex items-center justify-center gap-2">
            <p
              className={`text-center leading-snug ${
                promptIsEn ? 'font-sans text-xl text-ink' : 'font-display text-[1.5rem] font-medium text-accent'
              }`}
            >
              {answer}
            </p>
            <button
              aria-label="발음 듣기"
              onClick={() => speak(card.en)}
              className="text-ink-3 transition-colors hover:text-accent"
            >
              <Speaker size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={onReveal}
            className="mx-auto flex w-full max-w-[20rem] items-center justify-center border-b-2 border-dashed border-border pb-2 font-mono text-sm text-ink-3 transition-colors hover:border-accent hover:text-accent"
          >
            탭하여 정답 보기
          </button>
        )}
      </div>
    </>
  )
}
