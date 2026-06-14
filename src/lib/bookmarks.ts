import { db } from '../db/schema'

export async function toggleBookmark(cardId: string) {
  const ex = await db.bookmarks.get(cardId)
  if (ex) await db.bookmarks.delete(cardId)
  else await db.bookmarks.put({ cardId, createdAt: Date.now() })
}
