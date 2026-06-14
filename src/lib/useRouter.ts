import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'decks' }
  | { name: 'browse'; deckId: string }
  | { name: 'session'; deckId: string }
  | { name: 'stats' }
  | { name: 'settings' }

/**
 * 의존성 없는 스택 라우터.
 * push 시 history에 항목을 쌓아 iOS의 가장자리 스와이프/뒤로가기와 동기화된다.
 */
export function useRouter() {
  const [stack, setStack] = useState<Route[]>([{ name: 'decks' }])
  const route = stack[stack.length - 1]

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r])
    history.pushState({ t: Date.now() }, '')
    window.scrollTo(0, 0)
  }, [])

  const back = useCallback(() => {
    setStack((s) => {
      if (s.length > 1) history.back()
      return s
    })
  }, [])

  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return { route, push, back }
}
