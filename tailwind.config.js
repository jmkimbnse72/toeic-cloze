/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // 색은 전부 CSS 변수로 — 라이트/다크를 한 곳에서 토글
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        'ink-3': 'var(--text-3)',
        accent: 'var(--accent)',
        'accent-weak': 'var(--accent-weak)',
        danger: 'var(--danger)',
        'danger-weak': 'var(--danger-weak)',
        amber: 'var(--amber)',
        'amber-weak': 'var(--amber-weak)',
      },
      fontFamily: {
        // 한글 + UI 본문
        sans: ['Pretendard', 'Pretendard Variable', 'system-ui', 'sans-serif'],
        // 영어 표현 = 주인공 (디스플레이)
        display: ['"Space Grotesk"', 'Pretendard', 'sans-serif'],
        // Cloze 빈칸 / 데이터 / 라벨 = 제도용 모노
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.10)',
      },
      maxWidth: {
        reading: '34rem',
      },
    },
  },
  plugins: [],
}
