import { useEffect, useRef, useState, type ReactNode, type ChangeEvent } from 'react'
import { useSettings } from '../lib/settings'
import { getEnglishVoices, speak, ttsAvailable } from '../lib/tts'
import { exportBackup, importBackup } from '../lib/backup'
import { useTheme } from '../lib/useTheme'
import { TopBar, Segmented } from '../components/ui'
import { Download, Upload, Speaker, Sun, Moon } from '../components/icons'

const DAILY_OPTS = [10, 15, 20, 30, 40]

function useVoices() {
  const [voices, setVoices] = useState(getEnglishVoices())
  useEffect(() => {
    if (!ttsAvailable) return
    const on = () => setVoices(getEnglishVoices())
    window.speechSynthesis.addEventListener('voiceschanged', on)
    on()
    return () => window.speechSynthesis.removeEventListener('voiceschanged', on)
  }, [])
  return voices
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <p className="eyebrow">{title}</p>
      <div className="mt-3 rounded-card border border-border bg-surface">{children}</div>
    </section>
  )
}
function Row({ children }: { children: ReactNode }) {
  return <div className="border-b border-border px-5 py-4 last:border-0">{children}</div>
}

export default function Settings({ back }: { back: () => void }) {
  const [s, update] = useSettings()
  const { theme, toggle } = useTheme()
  const voices = useVoices()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('복원하면 현재 학습 기록을 덮어씁니다. 계속할까요?')) return
    try {
      const r = await importBackup(file)
      setMsg(`복원 완료 · 복습 ${r.reviews} · 북마크 ${r.bookmarks}`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : '복원 실패')
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-reading px-5 pb-16 sm:px-7">
      <TopBar title="설정" onBack={back} />

      {/* 발음 */}
      <Section title="발음 (TTS)">
        <Row>
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink">음성</span>
            <select
              value={s.ttsVoice}
              onChange={(e) => update({ ttsVoice: e.target.value })}
              className="max-w-[60%] rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none"
            >
              <option value="">자동 (기본 영어)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
          </label>
          {!ttsAvailable && (
            <p className="mt-2 text-xs text-ink-3">이 브라우저는 음성을 지원하지 않습니다.</p>
          )}
        </Row>
        <Row>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">속도</span>
            <span className="font-mono text-sm text-ink-2">{s.ttsRate.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={s.ttsRate}
            onChange={(e) => update({ ttsRate: Number(e.target.value) })}
            className="mt-3 w-full accent-accent"
          />
          <button
            onClick={() => speak('place an emphasis on quality')}
            className="mt-3 flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm text-ink-2 transition-colors hover:text-ink"
          >
            <Speaker size={16} /> 들어보기
          </button>
        </Row>
      </Section>

      {/* 학습 */}
      <Section title="학습">
        <Row>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">하루 신규 카드</span>
            <span className="font-mono text-sm text-ink-2">{s.dailyNew}장</span>
          </div>
          <div className="mt-3">
            <Segmented
              value={String(s.dailyNew)}
              options={DAILY_OPTS.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => update({ dailyNew: Number(v) })}
            />
          </div>
          <p className="mt-2.5 text-xs text-ink-3">
            복습은 한도와 무관하게 모두 출제됩니다.
          </p>
        </Row>
      </Section>

      {/* 테마 */}
      <Section title="화면">
        <Row>
          <button onClick={toggle} className="flex w-full items-center justify-between">
            <span className="text-sm text-ink">테마</span>
            <span className="flex items-center gap-2 text-sm text-ink-2">
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              {theme === 'dark' ? '다크' : '라이트'}
            </span>
          </button>
        </Row>
      </Section>

      {/* 데이터 */}
      <Section title="데이터 백업">
        <Row>
          <button
            onClick={exportBackup}
            className="flex w-full items-center gap-3 text-left"
          >
            <Download size={18} />
            <div>
              <p className="text-sm text-ink">내보내기 (JSON)</p>
              <p className="text-xs text-ink-3">학습 기록·북마크·설정을 파일로 저장</p>
            </div>
          </button>
        </Row>
        <Row>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 text-left"
          >
            <Upload size={18} />
            <div>
              <p className="text-sm text-ink">가져오기 (복원)</p>
              <p className="text-xs text-ink-3">기존 기록을 덮어씁니다</p>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onImport}
            className="hidden"
          />
        </Row>
      </Section>

      {msg && (
        <p className="mt-5 rounded-card bg-accent-weak px-4 py-3 text-center text-sm text-accent">
          {msg}
        </p>
      )}
      <p className="mt-8 text-center font-mono text-xs text-ink-3">
        토익 연어 · 학습 기록은 이 기기에 저장됩니다
      </p>
    </div>
  )
}
