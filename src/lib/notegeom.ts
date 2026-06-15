// 메모 캔버스의 순수 기하 계산 (테스트 가능하게 분리)

export interface View { x: number; y: number; scale: number }
export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

/** 화면(로컬 css px) → 월드 좌표 */
export const toWorld = (v: View, sx: number, sy: number): Pt => ({
  x: (sx - v.x) / v.scale,
  y: (sy - v.y) / v.scale,
})
/** 월드 → 화면 */
export const toScreen = (v: View, wx: number, wy: number): Pt => ({
  x: wx * v.scale + v.x,
  y: wy * v.scale + v.y,
})

/** 핀치 줌: 시작 시 고정점(anchorWorld)이 현재 중점(midNow) 아래 그대로 있도록 새 뷰 계산 */
export function pinchView(
  startScale: number,
  startDist: number,
  anchorWorld: Pt,
  midNow: Pt,
  distNow: number,
  minScale: number,
  maxScale: number,
): View {
  const scale = clamp(startScale * (distNow / (startDist || 1)), minScale, maxScale)
  return { scale, x: midNow.x - anchorWorld.x * scale, y: midNow.y - anchorWorld.y * scale }
}

export const panView = (v: View, dx: number, dy: number): View => ({
  ...v,
  x: v.x + dx,
  y: v.y + dy,
})

/** 휠 줌(데스크톱): 커서 아래 월드점 고정 */
export function zoomAt(v: View, sx: number, sy: number, factor: number, minScale: number, maxScale: number): View {
  const anchor = toWorld(v, sx, sy)
  const scale = clamp(v.scale * factor, minScale, maxScale)
  return { scale, x: sx - anchor.x * scale, y: sy - anchor.y * scale }
}

export function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
export function bbox(pts: Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
export const inRect = (x: number, y: number, r: Rect) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
