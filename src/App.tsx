import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ensureSeeded } from './db/seed'
import { db } from './db/schema'
import { useRouter } from './lib/useRouter'
import { FIELD_TAG } from './lib/queries'
import Decks from './screens/Decks'
import Browse from './screens/Browse'
import Session from './screens/Session'
import Stats from './screens/Stats'
import Settings from './screens/Settings'

function useDeckTitle(deckId: string): string {
  const title = useLiveQuery(async () => {
    if (deckId === 'all') return '전체'
    if (deckId === 'field') return FIELD_TAG
    if (deckId === 'weak') return '약점'
    if (deckId === 'marked') return '북마크'
    const d = await db.decks.get(deckId)
    return d ? d.name : '학습'
  }, [deckId])
  return title ?? '학습'
}

export default function App() {
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)
  const { route, push, back } = useRouter()

  useEffect(() => {
    ensureSeeded()
      .then(() => setSeeded(true))
      .catch((e) => {
        console.error(e)
        setError('데이터를 불러오지 못했습니다. 새로고침해 주세요.')
      })
  }, [])

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <p className="text-ink-2">{error}</p>
      </div>
    )
  }
  if (!seeded) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    )
  }

  if (route.name === 'browse')
    return <BrowseRoute deckId={route.deckId} push={push} back={back} />
  if (route.name === 'session')
    return <SessionRoute deckId={route.deckId} back={back} />
  if (route.name === 'stats') return <Stats back={back} />
  if (route.name === 'settings') return <Settings back={back} />
  return <Decks go={push} />
}

function BrowseRoute({
  deckId,
  push,
  back,
}: {
  deckId: string
  push: ReturnType<typeof useRouter>['push']
  back: () => void
}) {
  const title = useDeckTitle(deckId)
  return <Browse deckId={deckId} title={title} go={push} back={back} />
}

function SessionRoute({ deckId, back }: { deckId: string; back: () => void }) {
  const title = useDeckTitle(deckId)
  return <Session deckId={deckId} title={title} back={back} />
}
