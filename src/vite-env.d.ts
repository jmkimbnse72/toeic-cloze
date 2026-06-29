/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 빌드 시 주입되는 버전 상수 (vite.config.ts의 define)
declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string
declare const __BUILD_DATE__: string
