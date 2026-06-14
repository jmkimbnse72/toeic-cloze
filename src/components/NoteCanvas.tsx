import { useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { Pen, Eraser, Marquee, Undo, Trash, Copy, Close } from './icons'

interface Pt { x: number; y: number; p: number }
interface Stroke { id: string; color: string; width: number; pts: Pt[] }
interface Rect { x: number; y: number; w: number; h: number }
type Tool = 'pen' | 'eraser' | 'select'

// 라이트/다크 양쪽에서 보이는 잉크 색. 'ink'는 테마 글자색으로 대체.
const COLORS = ['ink', '#19a38c', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7']
const WIDTHS = [2, 4, 7]
const ERASER_R = 14

const uid = () => Math.random().toString(36).slice(2, 9)
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const resolve = (c: string, ink: string) => (c === 'ink' ? ink : c)

function distToSeg(px: number, py: number, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx, cy = a.y + t * dy
  return Math.hypot(px - cx, py - cy)
}
function bbox(s: Stroke): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of s.pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
const inRect = (x: number, y: number, r: Rect) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const clone = (s: Stroke[]): Stroke[] => JSON.parse(JSON.stringify(s))

export default function NoteCanvas({
  deckId,
  onClose,
}: {
  deckId: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const historyRef = useRef<Stroke[][]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 선택/이동 제스처용
  const selRectRef = useRef<Rect | null>(null)
  const gestureRef = useRef<{ mode: 'rect' | 'move'; sx: number; sy: number; orig?: Stroke[]; origRect?: Rect } | null>(null)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('ink')
  const [width, setWidth] = useState(4)
  const [sel, setSel] = useState<{ ids: string[]; rect: Rect } | null>(null)
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)

  // ── 렌더 ────────────────────────────────────────────────
  function redraw() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = c.width / dpr, h = c.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const ink = cssVar('--text') || '#1c1d1a'
    const grid = cssVar('--border') || '#e5e4de'

    // 점 격자
    ctx.fillStyle = grid
    ctx.globalAlpha = 0.5
    for (let gx = 24; gx < w; gx += 24)
      for (let gy = 24; gy < h; gy += 24) {
        ctx.beginPath(); ctx.arc(gx, gy, 0.8, 0, 6.283); ctx.fill()
      }
    ctx.globalAlpha = 1

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokesRef.current) drawStroke(ctx, s, ink)

    // 선택 박스
    const r = selRectRef.current
    if (r) {
      ctx.save()
      ctx.fillStyle = cssVar('--accent') || '#0f766e'
      ctx.globalAlpha = 0.08
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.globalAlpha = 1
      ctx.strokeStyle = cssVar('--accent') || '#0f766e'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.setLineDash([])
      ctx.restore()
    }
  }
  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, ink: string) {
    ctx.strokeStyle = resolve(s.color, ink)
    if (s.pts.length === 1) {
      const p = s.pts[0]
      ctx.fillStyle = resolve(s.color, ink)
      ctx.beginPath(); ctx.arc(p.x, p.y, s.width / 2, 0, 6.283); ctx.fill()
      return
    }
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1], b = s.pts[i]
      ctx.lineWidth = s.width * (0.6 + 0.4 * ((a.p + b.p) / 2))
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
  }

  // ── 크기/로드 ───────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current, wrap = wrapRef.current
    if (!c || !wrap) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = wrap.getBoundingClientRect()
      c.width = Math.max(1, Math.floor(rect.width * dpr))
      c.height = Math.max(1, Math.floor(rect.height * dpr))
      c.style.width = rect.width + 'px'
      c.style.height = rect.height + 'px'
      redraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    db.notes.get(deckId).then((n) => {
      if (!alive) return
      strokesRef.current = (n?.strokes as Stroke[]) ?? []
      historyRef.current = []
      selRectRef.current = null
      setSel(null)
      redraw()
    })
    return () => { alive = false }
  }, [deckId])

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      db.notes.put({ deckId, strokes: strokesRef.current, updatedAt: Date.now() })
    }, 400)
  }
  function pushHistory() {
    historyRef.current.push(clone(strokesRef.current))
    if (historyRef.current.length > 40) historyRef.current.shift()
  }
  function commit() {
    scheduleSave()
    rerender()
  }
  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    strokesRef.current = prev
    selRectRef.current = null
    setSel(null)
    redraw(); scheduleSave()
  }
  function clearAll() {
    if (!strokesRef.current.length) return
    if (!confirm('메모를 모두 지울까요?')) return
    pushHistory()
    strokesRef.current = []
    selRectRef.current = null
    setSel(null)
    redraw(); scheduleSave()
  }

  // ── 포인터 ──────────────────────────────────────────────
  function pt(e: React.PointerEvent): Pt {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, p: e.pressure > 0 ? e.pressure : 0.5 }
  }
  function onDown(e: React.PointerEvent) {
    canvasRef.current!.setPointerCapture(e.pointerId)
    const p = pt(e)
    if (tool === 'pen') {
      pushHistory()
      drawingRef.current = { id: uid(), color, width, pts: [p] }
    } else if (tool === 'eraser') {
      pushHistory()
      eraseAt(p)
    } else {
      // select
      if (sel && inRect(p.x, p.y, sel.rect)) {
        gestureRef.current = { mode: 'move', sx: p.x, sy: p.y, orig: clone(strokesRef.current.filter((s) => sel.ids.includes(s.id))), origRect: { ...sel.rect } }
        pushHistory()
      } else {
        gestureRef.current = { mode: 'rect', sx: p.x, sy: p.y }
        selRectRef.current = { x: p.x, y: p.y, w: 0, h: 0 }
        setSel(null)
        redraw()
      }
    }
  }
  function onMove(e: React.PointerEvent) {
    if (e.buttons === 0 && tool !== 'pen') return
    const p = pt(e)
    if (tool === 'pen' && drawingRef.current) {
      const s = drawingRef.current
      const last = s.pts[s.pts.length - 1]
      s.pts.push(p)
      const ctx = canvasRef.current!.getContext('2d')!
      const ink = cssVar('--text') || '#1c1d1a'
      ctx.strokeStyle = resolve(s.color, ink)
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.lineWidth = s.width * (0.6 + 0.4 * ((last.p + p.p) / 2))
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    } else if (tool === 'eraser' && e.buttons !== 0) {
      eraseAt(p)
    } else if (tool === 'select' && gestureRef.current) {
      const g = gestureRef.current
      if (g.mode === 'rect') {
        selRectRef.current = { x: Math.min(g.sx, p.x), y: Math.min(g.sy, p.y), w: Math.abs(p.x - g.sx), h: Math.abs(p.y - g.sy) }
        redraw()
      } else if (g.mode === 'move' && sel && g.orig && g.origRect) {
        const dx = p.x - g.sx, dy = p.y - g.sy
        const map = new Map(g.orig.map((s) => [s.id, s]))
        strokesRef.current = strokesRef.current.map((s) => {
          const o = map.get(s.id)
          if (!o) return s
          return { ...s, pts: o.pts.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) }
        })
        selRectRef.current = { ...g.origRect, x: g.origRect.x + dx, y: g.origRect.y + dy }
        redraw()
      }
    }
  }
  function onUp() {
    if (tool === 'pen' && drawingRef.current) {
      strokesRef.current = [...strokesRef.current, drawingRef.current]
      drawingRef.current = null
      commit()
    } else if (tool === 'eraser') {
      commit()
    } else if (tool === 'select' && gestureRef.current) {
      const g = gestureRef.current
      if (g.mode === 'rect') {
        const r = selRectRef.current!
        if (r.w < 4 && r.h < 4) {
          selRectRef.current = null; setSel(null); redraw()
        } else {
          const ids = strokesRef.current
            .filter((s) => s.pts.some((q) => inRect(q.x, q.y, r)))
            .map((s) => s.id)
          if (ids.length) {
            const rects = strokesRef.current.filter((s) => ids.includes(s.id)).map(bbox)
            const x0 = Math.min(...rects.map((b) => b.x)) - 6
            const y0 = Math.min(...rects.map((b) => b.y)) - 6
            const x1 = Math.max(...rects.map((b) => b.x + b.w)) + 6
            const y1 = Math.max(...rects.map((b) => b.y + b.h)) + 6
            const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
            selRectRef.current = rect
            setSel({ ids, rect })
          } else {
            selRectRef.current = null; setSel(null)
          }
          redraw()
        }
      } else {
        // move 완료
        if (sel) setSel({ ids: sel.ids, rect: selRectRef.current! })
        commit()
      }
      gestureRef.current = null
    }
  }
  function eraseAt(p: Pt) {
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter((s) => {
      if (s.pts.length === 1) return Math.hypot(s.pts[0].x - p.x, s.pts[0].y - p.y) > ERASER_R
      for (let i = 1; i < s.pts.length; i++)
        if (distToSeg(p.x, p.y, s.pts[i - 1], s.pts[i]) < ERASER_R + s.width / 2) return false
      return true
    })
    if (strokesRef.current.length !== before) redraw()
  }

  // 선택 액션
  function deleteSel() {
    if (!sel) return
    pushHistory()
    strokesRef.current = strokesRef.current.filter((s) => !sel.ids.includes(s.id))
    selRectRef.current = null; setSel(null); redraw(); scheduleSave()
  }
  function copySel() {
    if (!sel) return
    pushHistory()
    const off = 24
    const copies = strokesRef.current
      .filter((s) => sel.ids.includes(s.id))
      .map((s) => ({ ...s, id: uid(), pts: s.pts.map((q) => ({ ...q, x: q.x + off, y: q.y + off })) }))
    strokesRef.current = [...strokesRef.current, ...copies]
    const rect = { ...sel.rect, x: sel.rect.x + off, y: sel.rect.y + off }
    selRectRef.current = rect
    setSel({ ids: copies.map((c) => c.id), rect })
    redraw(); scheduleSave()
  }

  const toolBtn = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
      active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink'
    }`

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg md:static md:z-auto md:flex-1 md:border-l md:border-border">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
        <span className="mr-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-3">메모</span>
        <button className={toolBtn(tool === 'pen')} onClick={() => setTool('pen')} aria-label="펜"><Pen size={18} /></button>
        <button className={toolBtn(tool === 'eraser')} onClick={() => setTool('eraser')} aria-label="지우개"><Eraser size={18} /></button>
        <button className={toolBtn(tool === 'select')} onClick={() => setTool('select')} aria-label="선택"><Marquee size={18} /></button>

        <span className="mx-1 h-6 w-px bg-border" />

        {/* 색상 */}
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => {
            const active = color === c && tool !== 'eraser'
            return (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen') }}
                aria-label={`색상 ${c}`}
                className={`h-6 w-6 rounded-full border transition-transform active:scale-90 ${active ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg' : 'border-border'}`}
                style={{ background: c === 'ink' ? 'var(--text)' : c }}
              />
            )
          })}
        </div>

        <span className="mx-1 h-6 w-px bg-border" />

        {/* 두께 */}
        <div className="flex items-center gap-1.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => { setWidth(w); if (tool === 'select') setTool('pen') }}
              aria-label={`두께 ${w}`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${width === w ? 'bg-surface-2' : ''}`}
            >
              <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>

        <span className="mx-1 h-6 w-px bg-border" />

        <button className={toolBtn(false)} onClick={undo} aria-label="실행 취소"><Undo size={18} /></button>
        <button className={toolBtn(false)} onClick={clearAll} aria-label="전체 지우기"><Trash size={18} /></button>

        <button className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2 hover:text-ink md:hidden" onClick={onClose} aria-label="닫기"><Close size={18} /></button>
      </div>

      {/* 캔버스 */}
      <div ref={wrapRef} className="relative flex-1 bg-surface">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="block touch-none"
        />
        {/* 선택 액션 */}
        {sel && (
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-card">
            <button onClick={copySel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2">
              <Copy size={16} /> 복사
            </button>
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger-weak">
              <Trash size={16} /> 삭제
            </button>
            <button onClick={() => { selRectRef.current = null; setSel(null); redraw() }} className="rounded-full px-2 py-1.5 text-ink-3 transition-colors hover:text-ink" aria-label="선택 해제">
              <Close size={16} />
            </button>
          </div>
        )}
        {tool === 'select' && !sel && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[0.7rem] text-ink-3">
            영역을 드래그해 선택 → 삭제·복사, 선택 안을 끌어 이동
          </p>
        )}
      </div>
    </div>
  )
}
