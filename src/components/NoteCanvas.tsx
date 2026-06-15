import { useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { Pen, Eraser, Marquee, Hand, Recenter, Undo, Trash, Copy, Close } from './icons'

interface Pt { x: number; y: number }
interface Stroke { id: string; color: string; width: number; pts: Pt[] }
interface Rect { x: number; y: number; w: number; h: number }
interface View { x: number; y: number; scale: number }
type Tool = 'pen' | 'eraser' | 'select' | 'pan'

const COLORS = ['ink', '#19a38c', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7']
const WIDTHS = [2.5, 4.5, 8]
const ERASER_R = 14
const MIN_DIST = 1.4
const PALM = 45 // 접촉 폭/높이가 이보다 크면 손바닥으로 간주
const MIN_SCALE = 0.4
const MAX_SCALE = 5

const uid = () => Math.random().toString(36).slice(2, 9)
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const resolve = (c: string, ink: string) => (c === 'ink' ? ink : c)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function distToSeg(px: number, py: number, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
function bbox(s: Stroke): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of s.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const clone = (s: Stroke[]): Stroke[] => JSON.parse(JSON.stringify(s))

export default function NoteCanvas({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const historyRef = useRef<Stroke[][]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })

  // 펜/마우스 동작 상태
  const penIdRef = useRef<number | null>(null)
  const penActionRef = useRef<{ kind: 'draw' | 'erase' | 'pan' | 'selrect' | 'selmove'; last?: Pt; orig?: Stroke[]; origRect?: Rect; sx?: number; sy?: number } | null>(null)
  const selRectRef = useRef<Rect | null>(null)
  // 손가락(터치) 상태
  const touchesRef = useRef<Map<number, Pt>>(new Map())
  const touchModeRef = useRef<'none' | 'pan' | 'pinch'>('none')
  const panLastRef = useRef<Pt>({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; anchor: Pt; scale: number }>({ dist: 1, anchor: { x: 0, y: 0 }, scale: 1 })

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('ink')
  const [width, setWidth] = useState(4.5)
  const [sel, setSel] = useState<{ ids: string[]; rect: Rect } | null>(null)
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)

  // ── 좌표 변환 ───────────────────────────────────────────
  const toWorld = (sx: number, sy: number): Pt => {
    const v = viewRef.current
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale }
  }
  const local = (clientX: number, clientY: number): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  // ── 렌더 ────────────────────────────────────────────────
  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, ink: string) {
    const col = resolve(s.color, ink)
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s.width
    const p = s.pts
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.width / 2, 0, 6.2832); ctx.fill(); return }
    if (p.length === 2) { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p[1].x, p[1].y); ctx.stroke(); return }
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y)
    ctx.lineTo((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2)
    for (let i = 1; i < p.length - 1; i++)
      ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2)
    ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y); ctx.stroke()
  }
  function redraw() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = c.width / dpr, H = c.height / dpr
    const v = viewRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y)
    const ink = cssVar('--text') || '#1c1d1a'

    // 점 격자 (월드 좌표)
    if (24 * v.scale > 9) {
      ctx.fillStyle = cssVar('--border') || '#e5e4de'; ctx.globalAlpha = 0.5
      const x0 = -v.x / v.scale, y0 = -v.y / v.scale, x1 = (W - v.x) / v.scale, y1 = (H - v.y) / v.scale
      const r = 0.8 / v.scale
      for (let gx = Math.floor(x0 / 24) * 24; gx < x1; gx += 24)
        for (let gy = Math.floor(y0 / 24) * 24; gy < y1; gy += 24) { ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.2832); ctx.fill() }
      ctx.globalAlpha = 1
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const s of strokesRef.current) drawStroke(ctx, s, ink)
    if (drawingRef.current) drawStroke(ctx, drawingRef.current, ink)
    const sr = selRectRef.current
    if (sr) {
      ctx.save()
      ctx.fillStyle = cssVar('--accent') || '#0f766e'; ctx.globalAlpha = 0.08
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h); ctx.globalAlpha = 1
      ctx.strokeStyle = cssVar('--accent') || '#0f766e'; ctx.lineWidth = 1.5 / v.scale
      ctx.setLineDash([5 / v.scale, 4 / v.scale]); ctx.strokeRect(sr.x, sr.y, sr.w, sr.h); ctx.setLineDash([])
      ctx.restore()
    }
  }

  // ── 크기/로드 ───────────────────────────────────────────
  function sizeCanvas() {
    const c = canvasRef.current, wrap = wrapRef.current; if (!c || !wrap) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const r = wrap.getBoundingClientRect()
    c.width = Math.max(1, Math.floor(r.width * dpr)); c.height = Math.max(1, Math.floor(r.height * dpr))
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px'
    redraw()
  }
  useEffect(() => {
    sizeCanvas()
    const wrap = wrapRef.current; if (!wrap) return
    const ro = new ResizeObserver(() => sizeCanvas()); ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let alive = true
    db.notes.get(deckId).then((n) => {
      if (!alive) return
      strokesRef.current = (n?.strokes as Stroke[]) ?? []
      historyRef.current = []; selRectRef.current = null; setSel(null)
      viewRef.current = { x: 0, y: 0, scale: 1 }
      redraw()
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { db.notes.put({ deckId, strokes: strokesRef.current, updatedAt: Date.now() }) }, 400)
  }
  function pushHistory() { historyRef.current.push(clone(strokesRef.current)); if (historyRef.current.length > 40) historyRef.current.shift() }
  function undo() { const p = historyRef.current.pop(); if (!p) return; strokesRef.current = p; selRectRef.current = null; setSel(null); redraw(); scheduleSave() }
  function clearAll() { if (!strokesRef.current.length) return; if (!confirm('메모를 모두 지울까요?')) return; pushHistory(); strokesRef.current = []; selRectRef.current = null; setSel(null); redraw(); scheduleSave() }
  function resetView() { viewRef.current = { x: 0, y: 0, scale: 1 }; redraw() }

  // ── 펜/마우스 ───────────────────────────────────────────
  const isPenType = (t: string) => t === 'pen' || t === 'mouse'
  function pushPoint(s: Stroke, p: Pt) {
    const last = s.pts[s.pts.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < MIN_DIST / viewRef.current.scale) return
    s.pts.push(p)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      if (penIdRef.current !== null) return // 펜 사용 중엔 손/손바닥 무시
      if (e.width > PALM || e.height > PALM) return // 손바닥 무시
      touchesRef.current.set(e.pointerId, local(e.clientX, e.clientY))
      if (touchesRef.current.size === 1) { touchModeRef.current = 'pan'; panLastRef.current = local(e.clientX, e.clientY) }
      else if (touchesRef.current.size === 2) startPinch()
      return
    }
    if (!isPenType(e.pointerType)) return
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    penIdRef.current = e.pointerId
    const lp = local(e.clientX, e.clientY)
    const w = toWorld(lp.x, lp.y)
    if (tool === 'pan') { penActionRef.current = { kind: 'pan', last: lp } }
    else if (tool === 'pen') { pushHistory(); drawingRef.current = { id: uid(), color, width, pts: [w] }; penActionRef.current = { kind: 'draw' }; redraw() }
    else if (tool === 'eraser') { pushHistory(); penActionRef.current = { kind: 'erase' }; eraseAt(w) }
    else { // select
      if (sel && inRect(w.x, w.y, sel.rect)) {
        penActionRef.current = { kind: 'selmove', sx: w.x, sy: w.y, orig: clone(strokesRef.current.filter((s) => sel.ids.includes(s.id))), origRect: { ...sel.rect } }
        pushHistory()
      } else {
        penActionRef.current = { kind: 'selrect', sx: w.x, sy: w.y }
        selRectRef.current = { x: w.x, y: w.y, w: 0, h: 0 }; setSel(null); redraw()
      }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      if (!touchesRef.current.has(e.pointerId)) return
      touchesRef.current.set(e.pointerId, local(e.clientX, e.clientY))
      if (touchesRef.current.size >= 2) doPinch()
      else if (touchesRef.current.size === 1) doTouchPan()
      return
    }
    if (penIdRef.current !== e.pointerId || !penActionRef.current) return
    e.preventDefault()
    const a = penActionRef.current
    if (a.kind === 'draw' && drawingRef.current) {
      const ne = e.nativeEvent as PointerEvent
      const evs = ne.getCoalescedEvents ? ne.getCoalescedEvents() : [ne]
      for (const ev of evs) { const lp = local(ev.clientX, ev.clientY); pushPoint(drawingRef.current, toWorld(lp.x, lp.y)) }
      redraw()
    } else if (a.kind === 'erase') {
      const lp = local(e.clientX, e.clientY); eraseAt(toWorld(lp.x, lp.y))
    } else if (a.kind === 'pan') {
      const lp = local(e.clientX, e.clientY)
      const v = viewRef.current; v.x += lp.x - a.last!.x; v.y += lp.y - a.last!.y; a.last = lp; redraw()
    } else if (a.kind === 'selrect') {
      const lp = local(e.clientX, e.clientY); const w = toWorld(lp.x, lp.y)
      selRectRef.current = { x: Math.min(a.sx!, w.x), y: Math.min(a.sy!, w.y), w: Math.abs(w.x - a.sx!), h: Math.abs(w.y - a.sy!) }; redraw()
    } else if (a.kind === 'selmove' && sel && a.orig && a.origRect) {
      const lp = local(e.clientX, e.clientY); const w = toWorld(lp.x, lp.y)
      const dx = w.x - a.sx!, dy = w.y - a.sy!
      const map = new Map(a.orig.map((s) => [s.id, s]))
      strokesRef.current = strokesRef.current.map((s) => { const o = map.get(s.id); return o ? { ...s, pts: o.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : s })
      selRectRef.current = { ...a.origRect, x: a.origRect.x + dx, y: a.origRect.y + dy }; redraw()
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType === 'touch') {
      touchesRef.current.delete(e.pointerId)
      if (touchesRef.current.size === 1) { touchModeRef.current = 'pan'; panLastRef.current = Array.from(touchesRef.current.values())[0] }
      else if (touchesRef.current.size === 0) touchModeRef.current = 'none'
      return
    }
    if (penIdRef.current !== e.pointerId) return
    penIdRef.current = null
    const a = penActionRef.current; penActionRef.current = null
    if (!a) return
    if (a.kind === 'draw' && drawingRef.current) {
      strokesRef.current = [...strokesRef.current, drawingRef.current]; drawingRef.current = null
      redraw(); scheduleSave(); rerender()
    } else if (a.kind === 'erase') { scheduleSave() }
    else if (a.kind === 'selrect') {
      const r = selRectRef.current!
      if (r.w * viewRef.current.scale < 4 && r.h * viewRef.current.scale < 4) { selRectRef.current = null; setSel(null); redraw() }
      else {
        const ids = strokesRef.current.filter((s) => s.pts.some((q) => inRect(q.x, q.y, r))).map((s) => s.id)
        if (ids.length) {
          const rs = strokesRef.current.filter((s) => ids.includes(s.id)).map(bbox)
          const rect: Rect = { x: Math.min(...rs.map((b) => b.x)) - 6, y: Math.min(...rs.map((b) => b.y)) - 6, w: 0, h: 0 }
          rect.w = Math.max(...rs.map((b) => b.x + b.w)) + 6 - rect.x
          rect.h = Math.max(...rs.map((b) => b.y + b.h)) + 6 - rect.y
          selRectRef.current = rect; setSel({ ids, rect })
        } else { selRectRef.current = null; setSel(null) }
        redraw()
      }
    } else if (a.kind === 'selmove') {
      if (sel) setSel({ ids: sel.ids, rect: selRectRef.current! }); scheduleSave()
    }
  }

  // ── 손가락 제스처 ───────────────────────────────────────
  function doTouchPan() {
    const cur = Array.from(touchesRef.current.values())[0]; if (!cur) return
    const v = viewRef.current; v.x += cur.x - panLastRef.current.x; v.y += cur.y - panLastRef.current.y
    panLastRef.current = cur; redraw()
  }
  function startPinch() {
    const ps = Array.from(touchesRef.current.values()); if (ps.length < 2) return
    touchModeRef.current = 'pinch'
    const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
    const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }
    pinchRef.current = { dist, anchor: toWorld(mid.x, mid.y), scale: viewRef.current.scale }
  }
  function doPinch() {
    const ps = Array.from(touchesRef.current.values()); if (ps.length < 2) return
    const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
    const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }
    const pr = pinchRef.current
    const scale = clamp(pr.scale * (dist / (pr.dist || 1)), MIN_SCALE, MAX_SCALE)
    const v = viewRef.current
    v.scale = scale; v.x = mid.x - pr.anchor.x * scale; v.y = mid.y - pr.anchor.y * scale
    redraw()
  }

  function eraseAt(p: Pt) {
    const r = ERASER_R / viewRef.current.scale
    const before = strokesRef.current.length
    strokesRef.current = strokesRef.current.filter((s) => {
      if (s.pts.length === 1) return Math.hypot(s.pts[0].x - p.x, s.pts[0].y - p.y) > r
      for (let i = 1; i < s.pts.length; i++) if (distToSeg(p.x, p.y, s.pts[i - 1], s.pts[i]) < r + s.width / 2) return false
      return true
    })
    if (strokesRef.current.length !== before) redraw()
  }
  function deleteSel() { if (!sel) return; pushHistory(); strokesRef.current = strokesRef.current.filter((s) => !sel.ids.includes(s.id)); selRectRef.current = null; setSel(null); redraw(); scheduleSave() }
  function copySel() {
    if (!sel) return; pushHistory(); const off = 26
    const copies = strokesRef.current.filter((s) => sel.ids.includes(s.id)).map((s) => ({ ...s, id: uid(), pts: s.pts.map((q) => ({ x: q.x + off, y: q.y + off })) }))
    strokesRef.current = [...strokesRef.current, ...copies]
    const rect = { ...sel.rect, x: sel.rect.x + off, y: sel.rect.y + off }
    selRectRef.current = rect; setSel({ ids: copies.map((c) => c.id), rect }); redraw(); scheduleSave()
  }

  // 데스크톱: 휠 = 이동, Ctrl+휠 = 확대
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      if (e.ctrlKey) {
        const r = c.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top
        const anchor = toWorld(mx, my)
        const scale = clamp(v.scale * (1 - e.deltaY * 0.0015), MIN_SCALE, MAX_SCALE)
        v.scale = scale; v.x = mx - anchor.x * scale; v.y = my - anchor.y * scale
      } else { v.x -= e.deltaX; v.y -= e.deltaY }
      redraw()
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toolBtn = (active: boolean) => `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink'}`

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg md:static md:z-auto md:flex-1 md:border-l md:border-border">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
        <span className="mr-1 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-ink-3">메모</span>
        <button className={toolBtn(tool === 'pen')} onClick={() => setTool('pen')} aria-label="펜"><Pen size={18} /></button>
        <button className={toolBtn(tool === 'eraser')} onClick={() => setTool('eraser')} aria-label="지우개"><Eraser size={18} /></button>
        <button className={toolBtn(tool === 'select')} onClick={() => setTool('select')} aria-label="선택"><Marquee size={18} /></button>
        <button className={toolBtn(tool === 'pan')} onClick={() => setTool('pan')} aria-label="이동(손)"><Hand size={18} /></button>
        <span className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => {
            const active = color === c && tool === 'pen'
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
            <button key={w} onClick={() => { setWidth(w); setTool('pen') }} aria-label={`두께 ${w}`}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${width === w && tool === 'pen' ? 'bg-surface-2' : ''}`}>
              <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-border" />
        <button className={toolBtn(false)} onClick={resetView} aria-label="화면 맞춤"><Recenter size={18} /></button>
        <button className={toolBtn(false)} onClick={undo} aria-label="실행 취소"><Undo size={18} /></button>
        <button className={toolBtn(false)} onClick={clearAll} aria-label="전체 지우기"><Trash size={18} /></button>
        <button className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2 hover:text-ink md:hidden" onClick={onClose} aria-label="닫기"><Close size={18} /></button>
      </div>

      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-surface">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="block"
          style={{ touchAction: 'none' }}
        />
        {sel && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-card">
            <button onClick={copySel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"><Copy size={16} /> 복사</button>
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger-weak"><Trash size={16} /> 삭제</button>
            <button onClick={() => { selRectRef.current = null; setSel(null); redraw() }} className="rounded-full px-2 py-1.5 text-ink-3 transition-colors hover:text-ink" aria-label="선택 해제"><Close size={16} /></button>
          </div>
        )}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center font-mono text-[0.7rem] text-ink-3">
          {tool === 'pan' ? '펜으로 끌어 이동' : tool === 'select' && !sel ? '영역 드래그 → 삭제·복사·이동' : '애플펜슬 필기 · 한 손가락 이동 · 두 손가락 확대'}
        </p>
      </div>
    </div>
  )
}
