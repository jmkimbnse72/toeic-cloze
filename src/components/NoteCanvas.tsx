import { useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { Pen, Eraser, Marquee, Hand, Recenter, Undo, Trash, Copy, Close } from './icons'
import {
  type View, type Pt, type Rect,
  toWorld, pinchView, zoomAt, panView,
  distToSeg, bbox, inRect, dist, mid,
} from '../lib/notegeom'

interface Stroke { id: string; color: string; width: number; pts: Pt[] }
type Tool = 'pen' | 'eraser' | 'select' | 'pan'

const COLORS = ['ink', '#19a38c', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7']
const WIDTHS = [2.5, 4.5, 8]
const ERASER_R = 14
const MIN_DIST = 1.2
const MIN_SCALE = 0.4
const MAX_SCALE = 5

const uid = () => Math.random().toString(36).slice(2, 9)
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const resolve = (c: string, ink: string) => (c === 'ink' ? ink : c)
const clone = (s: Stroke[]): Stroke[] => JSON.parse(JSON.stringify(s))

export default function NoteCanvas({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const historyRef = useRef<Stroke[][]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })

  const penIdRef = useRef<number | null>(null)
  const penActRef = useRef<{ kind: 'draw' | 'erase' | 'pan' | 'selrect' | 'selmove'; last?: Pt; orig?: Stroke[]; origRect?: Rect; sx?: number; sy?: number } | null>(null)
  const selRectRef = useRef<Rect | null>(null)

  const touchesRef = useRef<Map<number, Pt>>(new Map())
  const panLastRef = useRef<Pt>({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; anchor: Pt; scale: number }>({ dist: 1, anchor: { x: 0, y: 0 }, scale: 1 })

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('ink')
  const [width, setWidth] = useState(4.5)
  const [sel, setSel] = useState<{ ids: string[]; rect: Rect } | null>(null)
  const [, force] = useState(0)
  const rerender = () => force((n) => n + 1)

  // 네이티브 핸들러가 최신 값을 읽도록 ref로 미러링
  const toolRef = useRef(tool); toolRef.current = tool
  const colorRef = useRef(color); colorRef.current = color
  const widthRef = useRef(width); widthRef.current = width
  const selRef = useRef(sel); selRef.current = sel
  const applySel = (next: { ids: string[]; rect: Rect } | null) => { selRef.current = next; setSel(next) }

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

  function sizeCanvas() {
    const c = canvasRef.current, wrap = wrapRef.current; if (!c || !wrap) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const r = wrap.getBoundingClientRect()
    c.width = Math.max(1, Math.floor(r.width * dpr)); c.height = Math.max(1, Math.floor(r.height * dpr))
    c.style.width = r.width + 'px'; c.style.height = r.height + 'px'
    redraw()
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { db.notes.put({ deckId, strokes: strokesRef.current, updatedAt: Date.now() }) }, 400)
  }
  function pushHistory() { historyRef.current.push(clone(strokesRef.current)); if (historyRef.current.length > 40) historyRef.current.shift() }
  function undo() { const p = historyRef.current.pop(); if (!p) return; strokesRef.current = p; selRectRef.current = null; applySel(null); redraw(); scheduleSave() }
  function clearAll() { if (!strokesRef.current.length) return; if (!confirm('메모를 모두 지울까요?')) return; pushHistory(); strokesRef.current = []; selRectRef.current = null; applySel(null); redraw(); scheduleSave() }
  function resetView() { viewRef.current = { x: 0, y: 0, scale: 1 }; redraw() }

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
  function deleteSel() { const cur = selRef.current; if (!cur) return; pushHistory(); strokesRef.current = strokesRef.current.filter((s) => !cur.ids.includes(s.id)); selRectRef.current = null; applySel(null); redraw(); scheduleSave() }
  function copySel() {
    const cur = selRef.current; if (!cur) return; pushHistory(); const off = 26
    const copies = strokesRef.current.filter((s) => cur.ids.includes(s.id)).map((s) => ({ ...s, id: uid(), pts: s.pts.map((q) => ({ x: q.x + off, y: q.y + off })) }))
    strokesRef.current = [...strokesRef.current, ...copies]
    const rect = { ...cur.rect, x: cur.rect.x + off, y: cur.rect.y + off }
    selRectRef.current = rect; applySel({ ids: copies.map((c) => c.id), rect }); redraw(); scheduleSave()
  }

  // ── 크기/로드 ───────────────────────────────────────────
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
      historyRef.current = []; selRectRef.current = null; applySel(null)
      viewRef.current = { x: 0, y: 0, scale: 1 }
      redraw()
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // 메모가 열려있는 동안 문서 전체에서 텍스트 선택 차단 (자동 선택 방지)
  useEffect(() => {
    const b = document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string; webkitTouchCallout?: string }
    const prev = { us: b.userSelect, wus: b.webkitUserSelect, wtc: b.webkitTouchCallout }
    b.userSelect = 'none'; b.webkitUserSelect = 'none'; b.webkitTouchCallout = 'none'
    return () => { b.userSelect = prev.us; b.webkitUserSelect = prev.wus ?? ''; b.webkitTouchCallout = prev.wtc ?? '' }
  }, [])

  // ── 네이티브 포인터 (iOS에서 안정적) ──────────────────────
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const lp = (clientX: number, clientY: number): Pt => {
      const r = c.getBoundingClientRect(); return { x: clientX - r.left, y: clientY - r.top }
    }
    const isPen = (t: string) => t === 'pen' || t === 'mouse'

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (penIdRef.current !== null) return // 펜 사용 중엔 손/손바닥 전부 무시
        touchesRef.current.set(e.pointerId, lp(e.clientX, e.clientY))
        if (touchesRef.current.size === 1) panLastRef.current = lp(e.clientX, e.clientY)
        else if (touchesRef.current.size === 2) startPinch()
        return
      }
      if (!isPen(e.pointerType)) return
      e.preventDefault()
      // 진행 중인 텍스트 선택을 즉시 해제 (다음 글자가 '선택 해제'에 먹히는 현상 방지)
      try { const g = window.getSelection?.(); if (g && g.rangeCount) g.removeAllRanges() } catch { /* noop */ }
      // 펜이 닿으면 손가락/손바닥 제스처 즉시 취소 (필기 중 손 흔들림 방지)
      touchesRef.current.clear()
      penIdRef.current = e.pointerId
      const l = lp(e.clientX, e.clientY)
      const w = toWorld(viewRef.current, l.x, l.y)
      const t = toolRef.current
      if (t === 'pan') penActRef.current = { kind: 'pan', last: l }
      else if (t === 'pen') { pushHistory(); drawingRef.current = { id: uid(), color: colorRef.current, width: widthRef.current, pts: [w] }; penActRef.current = { kind: 'draw' }; redraw() }
      else if (t === 'eraser') { pushHistory(); penActRef.current = { kind: 'erase' }; eraseAt(w) }
      else {
        const cur = selRef.current
        if (cur && inRect(w.x, w.y, cur.rect)) { penActRef.current = { kind: 'selmove', sx: w.x, sy: w.y, orig: clone(strokesRef.current.filter((s) => cur.ids.includes(s.id))), origRect: { ...cur.rect } }; pushHistory() }
        else { penActRef.current = { kind: 'selrect', sx: w.x, sy: w.y }; selRectRef.current = { x: w.x, y: w.y, w: 0, h: 0 }; applySel(null); redraw() }
      }
    }

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (penIdRef.current !== null || !touchesRef.current.has(e.pointerId)) return
        touchesRef.current.set(e.pointerId, lp(e.clientX, e.clientY))
        if (touchesRef.current.size >= 2) doPinch()
        else doTouchPan()
        return
      }
      if (penIdRef.current !== e.pointerId) return
      const a = penActRef.current; if (!a) return
      e.preventDefault()
      if (a.kind === 'draw' && drawingRef.current) {
        let evs: PointerEvent[] = [e]
        try { if (e.getCoalescedEvents) { const co = e.getCoalescedEvents(); if (co && co.length) evs = co } } catch { /* noop */ }
        const v = viewRef.current
        for (const ev of evs) {
          const l = lp(ev.clientX, ev.clientY); const w = toWorld(v, l.x, l.y)
          const last = drawingRef.current.pts[drawingRef.current.pts.length - 1]
          if (last && dist(w, last) < MIN_DIST / v.scale) continue
          drawingRef.current.pts.push(w)
        }
        redraw()
      } else if (a.kind === 'erase') { const l = lp(e.clientX, e.clientY); eraseAt(toWorld(viewRef.current, l.x, l.y)) }
      else if (a.kind === 'pan') { const l = lp(e.clientX, e.clientY); viewRef.current = panView(viewRef.current, l.x - a.last!.x, l.y - a.last!.y); a.last = l; redraw() }
      else if (a.kind === 'selrect') {
        const l = lp(e.clientX, e.clientY); const w = toWorld(viewRef.current, l.x, l.y)
        selRectRef.current = { x: Math.min(a.sx!, w.x), y: Math.min(a.sy!, w.y), w: Math.abs(w.x - a.sx!), h: Math.abs(w.y - a.sy!) }; redraw()
      } else if (a.kind === 'selmove' && a.orig && a.origRect) {
        const l = lp(e.clientX, e.clientY); const w = toWorld(viewRef.current, l.x, l.y)
        const dx = w.x - a.sx!, dy = w.y - a.sy!
        const map = new Map(a.orig.map((s) => [s.id, s]))
        strokesRef.current = strokesRef.current.map((s) => { const o = map.get(s.id); return o ? { ...s, pts: o.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : s })
        selRectRef.current = { ...a.origRect, x: a.origRect.x + dx, y: a.origRect.y + dy }; redraw()
      }
    }

    const up = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touchesRef.current.delete(e.pointerId)
        if (touchesRef.current.size === 1) panLastRef.current = Array.from(touchesRef.current.values())[0]
        return
      }
      if (penIdRef.current !== e.pointerId) return
      penIdRef.current = null
      const a = penActRef.current; penActRef.current = null; if (!a) return
      if (a.kind === 'draw' && drawingRef.current) { strokesRef.current = [...strokesRef.current, drawingRef.current]; drawingRef.current = null; redraw(); scheduleSave(); rerender() }
      else if (a.kind === 'erase') scheduleSave()
      else if (a.kind === 'selrect') {
        const r = selRectRef.current!; const sc = viewRef.current.scale
        if (r.w * sc < 4 && r.h * sc < 4) { selRectRef.current = null; applySel(null); redraw() }
        else {
          const ids = strokesRef.current.filter((s) => s.pts.some((q) => inRect(q.x, q.y, r))).map((s) => s.id)
          if (ids.length) {
            const rs = strokesRef.current.filter((s) => ids.includes(s.id)).map((s) => bbox(s.pts))
            const rect: Rect = { x: Math.min(...rs.map((b) => b.x)) - 6, y: Math.min(...rs.map((b) => b.y)) - 6, w: 0, h: 0 }
            rect.w = Math.max(...rs.map((b) => b.x + b.w)) + 6 - rect.x
            rect.h = Math.max(...rs.map((b) => b.y + b.h)) + 6 - rect.y
            selRectRef.current = rect; applySel({ ids, rect })
          } else { selRectRef.current = null; applySel(null) }
          redraw()
        }
      } else if (a.kind === 'selmove') { const cur = selRef.current; if (cur) applySel({ ids: cur.ids, rect: selRectRef.current! }); scheduleSave() }
    }

    function doTouchPan() {
      const cur = Array.from(touchesRef.current.values())[0]; if (!cur) return
      viewRef.current = panView(viewRef.current, cur.x - panLastRef.current.x, cur.y - panLastRef.current.y)
      panLastRef.current = cur; redraw()
    }
    function startPinch() {
      const ps = Array.from(touchesRef.current.values()); if (ps.length < 2) return
      pinchRef.current = { dist: dist(ps[0], ps[1]), anchor: toWorld(viewRef.current, mid(ps[0], ps[1]).x, mid(ps[0], ps[1]).y), scale: viewRef.current.scale }
    }
    function doPinch() {
      const ps = Array.from(touchesRef.current.values()); if (ps.length < 2) return
      const m = mid(ps[0], ps[1])
      const pr = pinchRef.current
      viewRef.current = pinchView(pr.scale, pr.dist, pr.anchor, m, dist(ps[0], ps[1]), MIN_SCALE, MAX_SCALE)
      redraw()
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      if (e.ctrlKey) viewRef.current = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, 1 - e.deltaY * 0.0015, MIN_SCALE, MAX_SCALE)
      else viewRef.current = panView(viewRef.current, -e.deltaX, -e.deltaY)
      redraw()
    }
    const noCtx = (e: Event) => e.preventDefault()
    const swallowTouch = (e: TouchEvent) => { e.preventDefault() } // iOS 선택/제스처 인식 차단 (포인터 이벤트는 그대로 발생)

    c.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    c.addEventListener('wheel', wheel, { passive: false })
    c.addEventListener('contextmenu', noCtx)
    c.addEventListener('touchstart', swallowTouch, { passive: false })
    c.addEventListener('touchmove', swallowTouch, { passive: false })
    c.addEventListener('touchend', swallowTouch, { passive: false })
    c.addEventListener('touchcancel', swallowTouch, { passive: false })
    return () => {
      c.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      c.removeEventListener('wheel', wheel)
      c.removeEventListener('contextmenu', noCtx)
      c.removeEventListener('touchstart', swallowTouch)
      c.removeEventListener('touchmove', swallowTouch)
      c.removeEventListener('touchend', swallowTouch)
      c.removeEventListener('touchcancel', swallowTouch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toolBtn = (active: boolean) => `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink'}`
  const noSelect = { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } as const

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg md:static md:z-auto md:flex-1 md:border-l md:border-border" style={noSelect}>
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

      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-surface" style={noSelect}>
        <canvas ref={canvasRef} className="block" style={{ touchAction: 'none', ...noSelect }} />
        {sel && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-card">
            <button onClick={copySel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"><Copy size={16} /> 복사</button>
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger-weak"><Trash size={16} /> 삭제</button>
            <button onClick={() => { selRectRef.current = null; applySel(null); redraw() }} className="rounded-full px-2 py-1.5 text-ink-3 transition-colors hover:text-ink" aria-label="선택 해제"><Close size={16} /></button>
          </div>
        )}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center font-mono text-[0.7rem] text-ink-3">
          {tool === 'pan' ? '펜으로 끌어 이동' : tool === 'select' && !sel ? '영역 드래그 → 삭제·복사·이동' : '애플펜슬 필기 · 한 손가락 이동 · 두 손가락 확대'}
        </p>
      </div>
    </div>
  )
}
