import { useEffect, useState } from 'react'

interface BIPEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * 설치 상태를 추적한다.
 * - Android/데스크톱 크롬: beforeinstallprompt 이벤트로 직접 설치 버튼 제공
 * - iOS 사파리: 이벤트가 없으므로 "공유 → 홈 화면에 추가" 안내가 필요
 */
export function useInstall() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true,
  )

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS는 데스크톱 UA로 위장하므로 터치 포인트로 보강
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  return { installed, isIOS, canPrompt: !!deferred, promptInstall }
}
