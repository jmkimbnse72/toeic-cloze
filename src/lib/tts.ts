import { getSettings } from './settings'

/** 영어 표현을 음성으로 읽어준다 (브라우저 내장 TTS, 무료·오프라인). */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  const { ttsVoice, ttsRate } = getSettings()
  u.rate = ttsRate || 0.95
  const voices = synth.getVoices()
  const chosen =
    (ttsVoice && voices.find((v) => v.voiceURI === ttsVoice)) ||
    voices.find((v) => v.lang.startsWith('en'))
  if (chosen) u.voice = chosen
  synth.speak(u)
}

export const ttsAvailable =
  typeof window !== 'undefined' && 'speechSynthesis' in window

/** 사용 가능한 영어 음성 목록을 구독하는 훅 */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!ttsAvailable) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'))
}
