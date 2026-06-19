import { useEffect, useRef, useState } from 'react'
import { db } from '../db/schema'
import { Pen, Eraser, Marquee, Hand, Recenter, Undo, Trash, Copy, Close } from './icons'
import {
  type View, type Pt, type Rect,
  toWorld, pinchView, zoomAt, panView,
  distToSeg, bbox, inRect, dist, mid, lerpPt,
} from '../lib/notegeom'

interface Stroke { id: string; color: string; width: number; pts: Pt[] }
type Tool = 'pen' | 'eraser' | 'select' | 'pan'

// 실행취소: 전체 스냅샷 대신 "역연산"만 보관 → 메모 크기와 무관하게 가벼움
type HistOp =
  | { t: 'add'; ids: string[] }                  // 획 추가됨 → 되돌리면 해당 id 제거
  | { t: 'remove'; strokes: Stroke[] }           // 획 삭제됨 → 되돌리면 다시 추가
  | { t: 'move'; ids: string[]; dx: number; dy: number } // 이동됨 → 되돌리면 -dx,-dy

const COLORS = ['ink', '#19a38c', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#a855f7']
const WIDTHS = [2.5, 4.5, 8]
const ERASER_R = 14
const MIN_DIST = 1.2
// 새 점이 직전 점 쪽으로 따라가는 비율(EMA). 작을수록 매끈하지만 코너가 둥글고 지연 ↑
const SMOOTHING = 0.4
const MIN_SCALE = 0.4
const MAX_SCALE = 5
const HISTORY_MAX = 100

const uid = () => Math.random().toString(36).slice(2, 9)
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const resolve = (c: string, ink: string) => (c === 'ink' ? ink : c)
const clone = (s: Stroke[]): Stroke[] => JSON.parse(JSON.stringify(s))

export default function NoteCanvas({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  // 아래(완성 획+격자) / 위(긋는 중인 획·선택 오버레이) 2층 캔버스
  const baseRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const historyRef = useRef<HistOp[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 })

  const penIdRef = useRef<number | null>(null)
  const penActRef = useRef<{ kind: 'draw' | 'erase' | 'pan' | 'selrect' | 'selmove'; last?: Pt; orig?: Stroke[]; origRect?: Rect; sx?: number; sy?: number; removed?: Stroke[]; dx?: number; dy?: number } | null>(null)
  const selRectRef = useRef<Rect | null>(null)
  // 선택 이동 중: base에서 숨길 id들 + live에 그릴 이동본
  const hiddenIdsRef = useRef<Set<string> | null>(null)
  const movingRef = useRef<Stroke[] | null>(null)

  const touchesRef = useRef<Map<number, Pt>>(new Map())
  const panLastRef = useRef<Pt>({ x: 0, y: 0 })
  const pinchRef = useRef<{ dist: number; anchor: Pt; scale: number }>({ dist: 1, anchor: { x: 0, y: 0 }, scale: 1 })

  // 색상은 매 프레임 getComputedStyle 하지 않고 캐시(테마 변경 시에만 갱신)
  const colorsRef = useRef({ ink: '#1c1d1a', border: '#e5e4de', accent: '#0f766e' })
  const dprRef = useRef(Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1))

  // rAF로 그리기를 1프레임 1회로 합침(과도한 redraw 방지)
  const rafRef = useRef<number | null>(null)
  const baseDirtyRef = useRef(false)
  const liveDirtyRef = useRef(false)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('ink')
  const [width, setWidth] = useState(4.5)
  const [sel, setSel] = useState<{ ids: string[]; rect: Rect } | null>(null)

  // 네이티브 핸들러가 최신 값을 읽도록 ref로 미러링
  const toolRef = useRef(tool); toolRef.current = tool
  const colorRef = useRef(color); colorRef.current = color
  const widthRef = useRef(width); widthRef.current = width
  const selRef = useRef(sel); selRef.current = sel
  const applySel = (next: { ids: string[]; rect: Rect } | null) => { selRef.current = next; setSel(next) }

  function readColors() {
    colorsRef.current = {
      ink: cssVar('--text') || '#1c1d1a',
      border: cssVar('--border') || '#e5e4de',
      accent: cssVar('--accent') || '#0f766e',
    }
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

  // 아래 층: 격자 + 완성된 모든 획(이동 중인 것은 숨김). 화면/구조 변화 시에만 호출.
  function paintBase() {
    const c = baseRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current
    const W = c.width / dpr, H = c.height / dpr
    const v = viewRef.current
    const col = colorsRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y)
    if (24 * v.scale > 9) {
      ctx.fillStyle = col.border; ctx.globalAlpha = 0.5
      const x0 = -v.x / v.scale, y0 = -v.y / v.scale, x1 = (W - v.x) / v.scale, y1 = (H - v.y) / v.scale
      const r = 0.8 / v.scale
      for (let gx = Math.floor(x0 / 24) * 24; gx < x1; gx += 24)
        for (let gy = Math.floor(y0 / 24) * 24; gy < y1; gy += 24) { ctx.beginPath(); ctx.arc(gx, gy, r, 0, 6.2832); ctx.fill() }
      ctx.globalAlpha = 1
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    const hidden = hiddenIdsRef.current
    for (const s of strokesRef.current) { if (hidden && hidden.has(s.id)) continue; drawStroke(ctx, s, col.ink) }
  }

  // 위 층: 긋는 중인 획 / 이동 중인 선택 획 / 선택 박스. 매 프레임 그려도 가벼움.
  function paintLive() {
    const c = liveRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current
    const W = c.width / dpr, H = c.height / dpr
    const v = viewRef.current
    const col = colorsRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (drawingRef.current) drawStroke(ctx, drawingRef.current, col.ink)
    const mv = movingRef.current
    if (mv) for (const s of mv) drawStroke(ctx, s, col.ink)
    const sr = selRectRef.current
    if (sr) {
      ctx.save()
      ctx.fillStyle = col.accent; ctx.globalAlpha = 0.08
      ctx.fillRect(sr.x, sr.y, sr.w, sr.h); ctx.globalAlpha = 1
      ctx.strokeStyle = col.accent; ctx.lineWidth = 1.5 / v.scale
      ctx.setLineDash([5 / v.scale, 4 / v.scale]); ctx.strokeRect(sr.x, sr.y, sr.w, sr.h); ctx.setLineDash([])
      ctx.restore()
    }
  }

  // 완성된 획 하나만 아래 층에 덧그림(전체 재렌더 회피) → 메모가 커도 일정 비용
  function commitToBase(s: Stroke) {
    const c = baseRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current, v = viewRef.current
    ctx.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    drawStroke(ctx, s, colorsRef.current.ink)
  }

  function flush() {
    rafRef.current = null
    if (baseDirtyRef.current) { baseDirtyRef.current = false; paintBase() }
    if (liveDirtyRef.current) { liveDirtyRef.current = false; paintLive() }
  }
  function schedule() { if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush) }
  function markBase() { baseDirtyRef.current = true; schedule() }
  function markLive() { liveDirtyRef.current = true; schedule() }
  function markAll() { baseDirtyRef.current = true; liveDirtyRef.current = true; schedule() }

  function sizeCanvas() {
    const base = baseRef.current, live = liveRef.current, wrap = wrapRef.current
    if (!base || !live || !wrap) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    dprRef.current = dpr
    const r = wrap.getBoundingClientRect()
    for (const c of [base, live]) {
      c.width = Math.max(1, Math.floor(r.width * dpr)); c.height = Math.max(1, Math.floor(r.height * dpr))
      c.style.width = r.width + 'px'; c.style.height = r.height + 'px'
    }
    readColors()
    paintBase(); paintLive()
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { db.notes.put({ deckId, strokes: strokesRef.current, updatedAt: Date.now() }) }, 400)
  }
  function pushOp(op: HistOp) { historyRef.current.push(op); if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift() }

  function undo() {
    const op = historyRef.current.pop(); if (!op) return
    if (op.t === 'add') { const rm = new Set(op.ids); strokesRef.current = strokesRef.current.filter((s) => !rm.has(s.id)) }
    else if (op.t === 'remove') strokesRef.current = [...strokesRef.current, ...op.strokes]
    else if (op.t === 'move') { const set = new Set(op.ids); strokesRef.current = strokesRef.current.map((s) => set.has(s.id) ? { ...s, pts: s.pts.map((p) => ({ x: p.x - op.dx, y: p.y - op.dy })) } : s) }
    selRectRef.current = null; applySel(null); hiddenIdsRef.current = null; movingRef.current = null; markAll(); scheduleSave()
  }
  function clearAll() {
    if (!strokesRef.current.length) return
    if (!confirm('메모를 모두 지울까요?')) return
    pushOp({ t: 'remove', strokes: strokesRef.current })
    strokesRef.current = []; selRectRef.current = null; applySel(null); markAll(); scheduleSave()
  }
  function resetView() { viewRef.current = { x: 0, y: 0, scale: 1 }; markAll() }

  // 지운 획들을 반환(실행취소용)
  function eraseAt(p: Pt): Stroke[] {
    const r = ERASER_R / viewRef.current.scale
    const removed: Stroke[] = []
    const kept = strokesRef.current.filter((s) => {
      let hit = false
      if (s.pts.length === 1) hit = Math.hypot(s.pts[0].x - p.x, s.pts[0].y - p.y) <= r
      else { for (let i = 1; i < s.pts.length; i++) if (distToSeg(p.x, p.y, s.pts[i - 1], s.pts[i]) < r + s.width / 2) { hit = true; break } }
      if (hit) removed.push(s)
      return !hit
    })
    if (removed.length) { strokesRef.current = kept; markBase() }
    return removed
  }
  function deleteSel() {
    const cur = selRef.current; if (!cur) return
    const ids = new Set(cur.ids)
    const removed = strokesRef.current.filter((s) => ids.has(s.id))
    pushOp({ t: 'remove', strokes: removed })
    strokesRef.current = strokesRef.current.filter((s) => !ids.has(s.id))
    selRectRef.current = null; applySel(null); markAll(); scheduleSave()
  }
  function copySel() {
    const cur = selRef.current; if (!cur) return; const off = 26
    const copies = strokesRef.current.filter((s) => cur.ids.includes(s.id)).map((s) => ({ ...s, id: uid(), pts: s.pts.map((q) => ({ x: q.x + off, y: q.y + off })) }))
    strokesRef.current = [...strokesRef.current, ...copies]
    pushOp({ t: 'add', ids: copies.map((c) => c.id) })
    const rect = { ...cur.rect, x: cur.rect.x + off, y: cur.rect.y + off }
    selRectRef.current = rect; applySel({ ids: copies.map((c) => c.id), rect }); markAll(); scheduleSave()
  }

  // ── 크기/로드 ───────────────────────────────────────────
  useEffect(() => {
    sizeCanvas()
    const wrap = wrapRef.current; if (!wrap) return
    const ro = new ResizeObserver(() => sizeCanvas()); ro.observe(wrap)
    return () => { ro.disconnect(); if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let alive = true
    db.notes.get(deckId).then((n) => {
      if (!alive) return
      strokesRef.current = (n?.strokes as Stroke[]) ?? []
      historyRef.current = []; selRectRef.current = null; applySel(null)
      hiddenIdsRef.current = null; movingRef.current = null
      viewRef.current = { x: 0, y: 0, scale: 1 }
      markAll()
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId])

  // 테마(다크모드) 변경 시 색상 캐시 갱신 → 평소엔 getComputedStyle 호출 안 함
  useEffect(() => {
    readColors()
    const obs = new MutationObserver(() => { readColors(); markAll() })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 메모가 열려있는 동안 문서 전체에서 텍스트 선택 차단 (자동 선택 방지)
  useEffect(() => {
    const b = document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string; webkitTouchCallout?: string }
    const prev = { us: b.userSelect, wus: b.webkitUserSelect, wtc: b.webkitTouchCallout }
    b.userSelect = 'none'; b.webkitUserSelect = 'none'; b.webkitTouchCallout = 'none'
    return () => { b.userSelect = prev.us; b.webkitUserSelect = prev.wus ?? ''; b.webkitTouchCallout = prev.wtc ?? '' }
  }, [])

  // ── 네이티브 포인터 (iOS에서 안정적) ──────────────────────
  useEffect(() => {
    const c = liveRef.current; if (!c) return
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
      else if (t === 'pen') { drawingRef.current = { id: uid(), color: colorRef.current, width: widthRef.current, pts: [w] }; penActRef.current = { kind: 'draw', last: w }; markLive() }
      else if (t === 'eraser') { penActRef.current = { kind: 'erase', removed: [] }; const rm = eraseAt(w); if (rm.length) penActRef.current.removed!.push(...rm) }
      else {
        const cur = selRef.current
        if (cur && inRect(w.x, w.y, cur.rect)) {
          const orig = clone(strokesRef.current.filter((s) => cur.ids.includes(s.id)))
          penActRef.current = { kind: 'selmove', sx: w.x, sy: w.y, orig, origRect: { ...cur.rect }, dx: 0, dy: 0 }
          hiddenIdsRef.current = new Set(cur.ids); movingRef.current = orig
          markAll() // base는 이동본을 숨기고, live가 이동본을 그림
        }
        else { penActRef.current = { kind: 'selrect', sx: w.x, sy: w.y }; selRectRef.current = { x: w.x, y: w.y, w: 0, h: 0 }; applySel(null); markLive() }
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
        const pts = drawingRef.current.pts
        for (const ev of evs) {
          const l = lp(ev.clientX, ev.clientY); const w = toWorld(v, l.x, l.y)
          if (a.last && dist(w, a.last) < MIN_DIST / v.scale) continue
          a.last = w
          const prev = pts[pts.length - 1]
          // 직전 점에서 새 점 쪽으로 일부만 이동 → 센서 떨림을 눌러 매끈하게
          pts.push(prev ? lerpPt(prev, w, SMOOTHING) : w)
        }
        markLive()
      } else if (a.kind === 'erase') { const l = lp(e.clientX, e.clientY); const rm = eraseAt(toWorld(viewRef.current, l.x, l.y)); if (rm.length) a.removed!.push(...rm) }
      else if (a.kind === 'pan') { const l = lp(e.clientX, e.clientY); viewRef.current = panView(viewRef.current, l.x - a.last!.x, l.y - a.last!.y); a.last = l; markAll() }
      else if (a.kind === 'selrect') {
        const l = lp(e.clientX, e.clientY); const w = toWorld(viewRef.current, l.x, l.y)
        selRectRef.current = { x: Math.min(a.sx!, w.x), y: Math.min(a.sy!, w.y), w: Math.abs(w.x - a.sx!), h: Math.abs(w.y - a.sy!) }; markLive()
      } else if (a.kind === 'selmove' && a.orig && a.origRect) {
        const l = lp(e.clientX, e.clientY); const w = toWorld(viewRef.current, l.x, l.y)
        const dx = w.x - a.sx!, dy = w.y - a.sy!
        a.dx = dx; a.dy = dy
        movingRef.current = a.orig.map((s) => ({ ...s, pts: s.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) }))
        selRectRef.current = { ...a.origRect, x: a.origRect.x + dx, y: a.origRect.y + dy }; markLive()
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
      if (a.kind === 'draw' && drawingRef.current) {
        // EMA 지연으로 끝점이 살짝 못 미치므로 실제 펜을 뗀 위치를 보정해 추가
        const l = lp(e.clientX, e.clientY); const w = toWorld(viewRef.current, l.x, l.y)
        const pts = drawingRef.current.pts
        if (pts.length && dist(w, pts[pts.length - 1]) > 0.4) pts.push(w)
        const s = drawingRef.current
        strokesRef.current = [...strokesRef.current, s]
        commitToBase(s)             // 완성 획만 아래 층에 덧그림(전체 재렌더 X)
        pushOp({ t: 'add', ids: [s.id] })
        drawingRef.current = null; markLive(); scheduleSave() // live의 현재 획 지움
      }
      else if (a.kind === 'erase') { if (a.removed && a.removed.length) pushOp({ t: 'remove', strokes: a.removed }); scheduleSave() }
      else if (a.kind === 'selrect') {
        const r = selRectRef.current!; const sc = viewRef.current.scale
        if (r.w * sc < 4 && r.h * sc < 4) { selRectRef.current = null; applySel(null); markLive() }
        else {
          const ids = strokesRef.current.filter((s) => s.pts.some((q) => inRect(q.x, q.y, r))).map((s) => s.id)
          if (ids.length) {
            const rs = strokesRef.current.filter((s) => ids.includes(s.id)).map((s) => bbox(s.pts))
            const rect: Rect = { x: Math.min(...rs.map((b) => b.x)) - 6, y: Math.min(...rs.map((b) => b.y)) - 6, w: 0, h: 0 }
            rect.w = Math.max(...rs.map((b) => b.x + b.w)) + 6 - rect.x
            rect.h = Math.max(...rs.map((b) => b.y + b.h)) + 6 - rect.y
            selRectRef.current = rect; applySel({ ids, rect })
          } else { selRectRef.current = null; applySel(null) }
          markLive()
        }
      } else if (a.kind === 'selmove' && a.orig) {
        const dx = a.dx || 0, dy = a.dy || 0
        const cur = selRef.current
        if ((dx || dy) && cur) {
          const set = new Set(cur.ids)
          strokesRef.current = strokesRef.current.map((s) => set.has(s.id) ? { ...s, pts: s.pts.map((q) => ({ x: q.x + dx, y: q.y + dy })) } : s)
          pushOp({ t: 'move', ids: cur.ids, dx, dy })
          applySel({ ids: cur.ids, rect: selRectRef.current! })
          scheduleSave()
        }
        hiddenIdsRef.current = null; movingRef.current = null; markAll()
      }
    }

    function doTouchPan() {
      const cur = Array.from(touchesRef.current.values())[0]; if (!cur) return
      viewRef.current = panView(viewRef.current, cur.x - panLastRef.current.x, cur.y - panLastRef.current.y)
      panLastRef.current = cur; markAll()
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
      markAll()
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = c.getBoundingClientRect()
      if (e.ctrlKey) viewRef.current = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, 1 - e.deltaY * 0.0015, MIN_SCALE, MAX_SCALE)
      else viewRef.current = panView(viewRef.current, -e.deltaX, -e.deltaY)
      markAll()
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
        <canvas ref={baseRef} className="absolute inset-0 block" style={{ pointerEvents: 'none', ...noSelect }} />
        <canvas ref={liveRef} className="absolute inset-0 block" style={{ touchAction: 'none', ...noSelect }} />
        {sel && (
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-card">
            <button onClick={copySel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-2"><Copy size={16} /> 복사</button>
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger-weak"><Trash size={16} /> 삭제</button>
            <button onClick={() => { selRectRef.current = null; applySel(null); markLive() }} className="rounded-full px-2 py-1.5 text-ink-3 transition-colors hover:text-ink" aria-label="선택 해제"><Close size={16} /></button>
          </div>
        )}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center font-mono text-[0.7rem] text-ink-3">
          {tool === 'pan' ? '펜으로 끌어 이동' : tool === 'select' && !sel ? '영역 드래그 → 삭제·복사·이동' : '애플펜슬 필기 · 한 손가락 이동 · 두 손가락 확대'}
        </p>
      </div>
    </div>
  )
}
