import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// 폰트를 앱에 내장(CDN 대신) → 서비스워커가 캐시하여 오프라인에서도 동일하게 표시
import 'pretendard/dist/web/variable/pretendardvariable.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
