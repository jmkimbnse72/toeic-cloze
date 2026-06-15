type P = { className?: string; size?: number }
const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const ChevronLeft = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
export const ChevronRight = ({ className, size }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const Sun = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
export const Moon = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)
export const Speaker = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
  </svg>
)
export const Shuffle = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M16 3h5v5M21 3l-7 7M4 20l7-7M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
)
export const Flame = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1-.4-2-1-3 2 1 4 3.5 4 7a7 7 0 0 1-14 0c0-4 4-6 7-11z" />
  </svg>
)
export const Bookmark = ({ size, filled }: P & { filled?: boolean }) => (
  <svg {...base(size)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6 4h12v16l-6-4-6 4V4z" />
  </svg>
)
export const ArrowRight = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const Chart = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-7" />
  </svg>
)
export const Gear = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.3 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
export const Download = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
)
export const Upload = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
)
export const Pen = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M12 19l7-7a2.1 2.1 0 0 0-3-3l-7 7-1 4 4-1z" />
    <path d="M16 6l2 2" />
  </svg>
)
export const Eraser = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M16 3l5 5L10 19H5l-2-2a2 2 0 0 1 0-3z" />
    <path d="M9 9l6 6" />
  </svg>
)
export const Marquee = ({ size }: P) => (
  <svg {...base(size)} strokeDasharray="3 3">
    <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
  </svg>
)
export const Undo = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M9 7L4 12l5 5" />
    <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
  </svg>
)
export const Trash = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
)
export const Copy = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </svg>
)
export const Notebook = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M5 4h13a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5z" />
    <path d="M9 4v16M5 8h2M5 12h2M5 16h2" />
  </svg>
)
export const Close = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const Hand = ({ size }: P) => (
  <svg {...base(size)}>
    <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.2-3L6 13.4a1.5 1.5 0 0 1 2.5-1.6z" />
  </svg>
)
export const Recenter = ({ size }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </svg>
)
