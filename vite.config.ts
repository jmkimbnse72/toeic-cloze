import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 앱 이름/테마는 manifest에서 한 곳으로 관리
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '토익 연어 — Cloze & 복습',
        short_name: '토익연어',
        description: '토목 엔지니어를 위한 토익 연어 학습 · 빈칸채우기 + 간격반복(SRS)',
        lang: 'ko',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#fafaf8',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 시드 데이터/폰트 포함 모든 정적 자산을 오프라인 캐시
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 개발 중에도 설치/오프라인을 점검할 수 있게
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
