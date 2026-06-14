import { db } from '../db/schema'
import { getSettings, saveSettings, type Settings } from './settings'

interface Backup {
  app: 'toeic-cloze'
  version: number
  exportedAt: number
  reviews: unknown[]
  bookmarks: unknown[]
  activity: unknown[]
  notes?: unknown[]
  settings: Settings
}

/** 학습 기록 전체를 JSON 파일로 내려받기 */
export async function exportBackup() {
  const data: Backup = {
    app: 'toeic-cloze',
    version: 1,
    exportedAt: Date.now(),
    reviews: await db.reviews.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    activity: await db.activity.toArray(),
    notes: await db.notes.toArray(),
    settings: getSettings(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const d = new Date()
  a.download = `toeic-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** JSON 파일에서 학습 기록 복원 (기존 학습 데이터 덮어씀, 카드/덱은 유지) */
export async function importBackup(file: File): Promise<{ reviews: number; bookmarks: number }> {
  const text = await file.text()
  const data = JSON.parse(text) as Backup
  if (data.app !== 'toeic-cloze') throw new Error('이 앱의 백업 파일이 아닙니다.')

  await db.transaction('rw', db.reviews, db.bookmarks, db.activity, db.notes, async () => {
    await db.reviews.clear()
    await db.bookmarks.clear()
    await db.activity.clear()
    await db.notes.clear()
    if (Array.isArray(data.reviews)) await db.reviews.bulkPut(data.reviews as never)
    if (Array.isArray(data.bookmarks)) await db.bookmarks.bulkPut(data.bookmarks as never)
    if (Array.isArray(data.activity)) await db.activity.bulkPut(data.activity as never)
    if (Array.isArray(data.notes)) await db.notes.bulkPut(data.notes as never)
  })
  if (data.settings) saveSettings({ ...getSettings(), ...data.settings })

  return {
    reviews: Array.isArray(data.reviews) ? data.reviews.length : 0,
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0,
  }
}
