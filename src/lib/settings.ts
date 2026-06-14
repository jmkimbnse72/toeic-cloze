import { useEffect, useState } from 'react'

export interface Settings {
  ttsVoice: string // voiceURI ('' = 자동)
  ttsRate: number // 0.5 ~ 1.2
  dailyNew: number // 하루 신규 카드 한도
}

const DEFAULTS: Settings = { ttsVoice: '', ttsRate: 0.95, dailyNew: 20 }
const KEY = 'settings.v1'

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s))
  window.dispatchEvent(new Event('settings-change'))
}

/** 설정 구독 훅 */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(getSettings)
  useEffect(() => {
    const on = () => setS(getSettings())
    window.addEventListener('settings-change', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('settings-change', on)
      window.removeEventListener('storage', on)
    }
  }, [])
  const update = (patch: Partial<Settings>) => {
    const next = { ...getSettings(), ...patch }
    saveSettings(next)
    setS(next)
  }
  return [s, update]
}
