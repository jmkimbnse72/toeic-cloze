import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** 테마는 localStorage에 저장(동기 → 깜빡임 없음). 학습 데이터는 IndexedDB 별도. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current)

  const apply = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', next === 'dark' ? '#14161a' : '#0f766e')
    localStorage.setItem('theme', next)
    setTheme(next)
  }, [])

  const toggle = useCallback(() => {
    apply(current() === 'dark' ? 'light' : 'dark')
  }, [apply])

  // 다른 탭/창에서 바뀐 경우 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme') setTheme(current())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { theme, toggle }
}
