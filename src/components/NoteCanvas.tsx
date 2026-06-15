import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { Pen, Eraser, Marquee, Undo, Trash, Copy, Close } from './icons'

interface Pt { x: number; y: number }
interface Stroke { id: string; color: string; width: number; pts: Pt[] }
interface Rect { x: number; y: number; w: number; h: number }
type Tool = 'pen' | 'eraser' | 'select'

const COLORS = ['ink', '#19a38c', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7']
const WIDTHS = [2.5, 4.5, 8]
const ERASER_R = 14
const MIN_DIST = 1.4 // 점 최소 간격(px) — 잡음 감소

const uid = () => Math.random().toString(36).slice(2, 9)
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const resolve = (c: string, ink: string) => (c === 'ink' ? ink : c)
const isPen = (t: string) => t === 'pen' || t === 'mouse' // 손가락(touch) 제외

function distToSeg(px: number, py: number, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const historyRef = useRef<Stroke[][]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selRectRef = useRef<Rect | null>(null)
  const gestureRef = useRef<{ mode: 'rect' | 'move'; sx: number; sy: number; orig?: Stroke[]; origRect?: Rect } | null>(null)
  const drawingPointer = useRef<number | null>(null)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('ink')
  const [width, setWidth] = useState(4.5)
  const [sel, setSel] = useState<{ ids: string[]; rect: Rect } | null>(null)
  const [contentH, setContentH] = useState(1200)
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)

  // ── 부드러운 렌더 (중점 이차곡선 보간) ────────────────────
  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, ink: string) {
    const col = resolve(s.color, ink)
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s.width
    const p = s.pts
    if (p.length === 1) {
      ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.width / 2, 0, 6.2832); ctx.fill(); return
    }
    if (p.length === 2) {
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.stroke(); return
    }
    ctx.beginPath()
    ctx.moveTo(p[0].x, p[0].y)
    ctx.lineTo((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2)
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2
      ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my)
    }
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y)
    ctx.stroke()
  }
  function redraw() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = c.width / dpr, h = c.height / dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const ink = cssVar('--text') || '#1c1d1a'
    const grid = cssVar('--border') || '#e5e4de'
    ctx.fillStyle = grid; ctx.globalAlpha = 0.5
    for (let gx = 24; gx < w; gx += 24)
      for (let gy = 24; gy < h; gy += 24) { ctx.beginPath(); ctx.arc(gx, gy, 0.8, 0, 6.2832); ctx.fill() }
    ctx.globalAlpha = 1
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const s of strokesRef.current) drawStroke(ctx, s, ink)
    if (drawingRef.current) drawStroke(ctx, drawingRef.current, ink)
    const r = selRectRef.current
    if (r) {
      ctx.save()
      ctx.fillStyle = cssVar('--accent') || '#0f766e'; ctx.globalAlpha = 0.08
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1
      ctx.strokeStyle = cssVar('--accent') || '#0f766e'; ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([])
      ctx.restore()
    }
  }

  // ── 크기(세로로 긴 필기면) ───────────────────────────────
  function sizeCanvas() {
    const c = canvasRef.current, sc = scrollRef.current
    if (!c || !sc) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = sc.clientWidth
    c.width = Math.max(1, Math.floor(w * dpr))
    c.height = Math.max(1, Math.floor(contentH * dpr))
    c.style.width = w + 'px'
    c.style.height = contentH + 'px'
    redraw()
  }
  useLayoutEffect(() => { sizeCanvas() }, [contentH])
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    // 처음에 보이는 높이보다 넉넉히 (스크롤 여백)
    setContentH((h) => Math.max(h, sc.clientHeight + 600))
    const ro = new ResizeObserver(() => sizeCanvas())
    ro.observe(sc)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    db.notes.get(deckId).then((n) => {
      if (!alive) return
      strokesRef.current = (n?.strokes as Stroke[]) ?? []
      historyRef.current = []
      selRectRef.current = null
      setSel(null)
      growToFit()
      redraw()
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  function growToFit() {
    let maxY = 0
    for (const s of strokesRef.current) for (const p of s.pts) maxY = Math.max(maxY, p.y)
    setContentH((h) => (maxY > h - 250 ? maxY + 600 : h))
  }
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
  function undo() {
    const prev = historyRef.current.pop()
    if (!prev) return
    strokesRef.current = prev
    selRectRef.current = null; setSel(null)
    redraw(); scheduleSave()
  }
  function clearAll() {
    if (!strokesRef.current.length) return
    if (!confirm('메모를 모두 지울까요?')) return
    pushHistory()
    strokesRef.current = []
    selRectRef.current = null; setSel(null)
    redraw(); scheduleSave()
  }

  // ── 포인터 ──────────────────────────────────────────────
  function toPt(clientX: number, clientY: number): Pt {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }
  function pushPoint(s: Stroke, p: Pt) {
    const last = s.pts[s.pts.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_DIST) return
    s.pts.push(p)
  }

  function onDown(e: React.PointerEvent) {
    if (!isPen(e.pointerType)) return // 손가락 → 스크롤(그리지 않음)
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawingPointer.current = e.pointerId
    const p = toPt(e.clientX, e.clientY)
    if (tool === 'pen') {
      pushHistory()
      drawingRef.current = { id: uid(), color, width, pts: [p] }
      redraw()
    } else if (tool === 'eraser') {
      pushHistory(); eraseAt(p)
    } else {
      if (sel && inRect(p.x, p.y, sel.rect)) {
        gestureRef.current = { mode: 'move', sx: p.x, sy: p.y, orig: clone(strokesRef.current.filter((s) => sel.ids.includes(s.id))), origRect: { ...sel.rect } }
        pushHistory()
      } else {
        gestureRef.current = { mode: 'rect', sx: p.x, sy: p.y }
        selRectRef.current = { x: p.x, y: p.y, w: 0, h: 0 }
        setSel(null); redraw()
      }
    }
  }
  function onMove(e: React.PointerEvent) {
    if (!isPen(e.pointerType) || drawingPointer.current !== e.pointerId) return
    e.preventDefault()
    if (tool === 'pen' && drawingRef.current) {
      const ne = e.nativeEvent as PointerEvent
      const evs = ne.getCoalescedEvents ? ne.getCoalescedEvents() : [ne]
      for (const ev of evs) pushPoint(drawingRef.current, toPt(ev.clientX, ev.clientY))
      redraw()
    } else if (tool === 'eraser') {
      eraseAt(toPt(e.clientX, e.clientY))
    } else if (tool === 'select' && gestureRef.current) {
      const g = gestureRef.current
      const p = toPt(e.clientX, e.clientY)
      if (g.mode === 'rect') {
        selRectRef.current = { x: Math.min(g.sx, p.x), y: Math.min(g.sy, p.y), w: Math.abs(p.x - g.sx), h: Math.abs(p.y - g.sy) }
        redraw()
      } else if (g.mode === 'move' && sel && g.orig && g.origRect) {
        const dx = p.x - g.sx, dy = p.y - g.sy
        const map = new Map(g.orig.map((s) => [s.id, s]))
        strokesRef.current = strokesRef.current.map((s) => {
          const o = map.get(s.id)
          return o ? { ...s, pts: o.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : s
        })
        selRectRef.current = { ...g.origRect, x: g.origRect.x + dx, y: g.origRect.y + dy }
        redraw()
      }
    }
  }
  function onUp(e: React.PointerEvent) {
    if (drawingPointer.current !== e.pointerId) return
    drawingPointer.current = null
    if (tool === 'pen' && drawingRef.current) {
      strokesRef.current = [...strokesRef.current, drawingRef.current]
      drawingRef.current = null
      growToFit(); redraw(); scheduleSave(); rerender()
    } else if (tool === 'eraser') {
      scheduleSave()
    } else if (tool === 'select' && gestureRef.current) {
      const g = gestureRef.current
      if (g.mode === 'rect') {
        const r = selRectRef.current!
        if (r.w < 4 && r.h < 4) { selRectRef.current = null; setSel(null); redraw() }
        else {
          const ids = strokesRef.current.filter((s) => s.pts.some((q) => inRect(q.x, q.y, r))).map((s) => s.id)
          if (ids.length) {
            const rs = strokesRef.current.filter((s) => ids.includes(s.id)).map(bbox)
            const rect = {
              x: Math.min(...rs.map((b) => b.x)) - 6, y: Math.min(...rs.map((b) => b.y)) - 6,
              w: 0, h: 0,
            }
            rect.w = Math.max(...rs.map((b) => b.x + b.w)) + 6 - rect.x
            rect.h = Math.max(...rs.map((b) => b.y + b.h)) + 6 - rect.y
            selRectRef.current = rect; setSel({ ids, rect })
          } else { selRectRef.current = null; setSel(null) }
          redraw()
        }
      } else {
        if (sel) setSel({ ids: sel.ids, rect: selRectRef.current! })
        scheduleSave()
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

  function deleteSel() {
    if (!sel) return
    pushHistory()
    strokesRef.current = strokesRef.current.filter((s) => !sel.ids.includes(s.id))
    selRectRef.current = null; setSel(null); redraw(); scheduleSave()
  }
  function copySel() {
    if (!sel) return
    pushHistory()
    const off = 26
    const copies = strokesRef.current.filter((s) => sel.ids.includes(s.id))
      .map((s) => ({ ...s, id: uid(), pts: s.pts.map((q) => ({ x: q.x + off, y: q.y + off })) }))
    strokesRef.current = [...strokesRef.current, ...copies]
    const rect = { ...sel.rect, x: sel.rect.x + off, y: sel.rect.y + off }
    selRectRef.current = rect; setSel({ ids: copies.map((c) => c.id), rect })
    growToFit(); redraw(); scheduleSave()
  }

  const toolBtn = (active: boolean) =>
    `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink'}`

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg md:static md:z-auto md:flex-1 md:border-l md:border-border">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
        <span className="mr-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-3">메모</span>
        <button className={toolBtn(tool === 'pen')} onClick={() => setTool('pen')} aria-label="펜"><Pen size={18} /></button>
        <button className={toolBtn(tool === 'eraser')} onClick={() => setTool('eraser')} aria-label="지우개"><Eraser size={18} /></button>
        <button className={toolBtn(tool === 'select')} onClick={() => setTool('select')} aria-label="선택"><Marquee size={18} /></button>
        <span className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => {
            const active = color === c && tool !== 'eraser'
            return (
              <button key={c} onClick={() => { setColor(c); setTool('pen') }} aria-label={`색상 ${c}`}
                className={`h-6 w-6 rounded-full border transition-transform active:scale-90 ${active ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg' : 'border-border'}`}
                style={{ background: c === 'ink' ? 'var(--text)' : c }} />
            )
          })}
        </div>
        <span className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          {WIDTHS.map((w) => (
            <button key={w} onClick={() => { setWidth(w); if (tool !== 'pen') setTool('pen') }} aria-label={`두께 ${w}`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${width === w ? 'bg-surface-2' : ''}`}>
              <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-border" />
        <button className={toolBtn(false)} onClick={undo} aria-label="실행 취소"><Undo size={18} /></button>
        <button className={toolBtn(false)} onClick={clearAll} aria-label="전체 지우기"><Trash size={18} /></button>
        <button className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2 hover:text-ink md:hidden" onClick={onClose} aria-label="닫기"><Close size={18} /></button>
      </div>

      {/* 본문: 손가락으로 세로 스크롤 / 펜으로 필기 */}
      <div className="relative flex-1 overflow-hidden bg-surface">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block"
            style={{ touchAction: 'pan-y' }}
          />
        </div>

        {sel && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-card">
            <button onClick={copySel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"><Copy size={16} /> 복사</button>
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger-weak"><Trash size={16} /> 삭제</button>
            <button onClick={() => { selRectRef.current = null; setSel(null); redraw() }} className="rounded-full px-2 py-1.5 text-ink-3 transition-colors hover:text-ink" aria-label="선택 해제"><Close size={16} /></button>
          </div>
        )}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center font-mono text-[0.7rem] text-ink-3">
          {tool === 'select' && !sel ? '영역을 드래그해 선택 → 삭제·복사·이동' : '애플펜슬로 필기 · 손가락으로 스크롤'}
        </p>
      </div>
    </div>
  )
}
