// 토큰 단위 Cloze 생성 — Part 5가 노리는 전치사를 1순위로 가리고,
// 없으면 핵심 내용어(주로 동사)로 폴백한다.

const PREPS = new Set([
  'on', 'in', 'at', 'to', 'for', 'with', 'of', 'from', 'into', 'onto',
  'over', 'under', 'by', 'about', 'against', 'between', 'among', 'amongst',
  'through', 'throughout', 'during', 'within', 'without', 'toward', 'towards',
  'upon', 'across', 'after', 'before', 'behind', 'beyond', 'beside', 'besides',
  'around', 'off', 'per', 'via', 'amid', 'despite', 'regarding', 'concerning',
])

const STOP = new Set([
  'a', 'an', 'the', 'be', 'been', 'being', 'am', 'is', 'are', 'was', 'were',
  'to', 'that', 'this', 'these', 'those', 'not', 'no', 'and', 'or', 'but',
  'than', 'as', 'so', 'very', 'more', 'most', 'much', 'such', 'all', 'any',
  'each', 'its', 'their', 'your', 'our', 'his', 'her', 'will', 'would', 'shall',
  'can', 'could', 'should', 'may', 'might', 'must', 'do', 'does', 'did', 'have',
  'has', 'had',
  'i', 'we', 'you', 'they', 'he', 'she', 'it', 'one', 'us', 'them', 'him', 'me',
])

export interface Cloze {
  /** 공백 분리 토큰 (원형 그대로 — 표시에 사용) */
  tokens: string[]
  /** 가려질 토큰 인덱스 */
  blank: number
  /** 정답(소문자·문장부호 제거 핵심어) */
  answer: string
}

/** 비교/입력 정규화 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\-]/g, '')
    .trim()
}

/** 토큰의 핵심어: 대괄호/괄호 앞부분 + 양끝 문장부호 제거 후 소문자 */
function coreWord(tok: string): string {
  const head = tok.split(/[[(]/)[0]
  const trimmed = head.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9'’\-]+$/, '')
  return trimmed.toLowerCase().replace(/’/g, "'")
}

/** 플레이스홀더( ~, A, B, 한글, 기호 ) 토큰은 가리지 않음 */
function isPlaceholder(tok: string): boolean {
  if (/[^\x00-\x7F]/.test(tok)) return true
  if (/^[AB]$/.test(tok)) return true
  if (!coreWord(tok)) return true
  return false
}

/** 영어 표현에서 빈칸 하나를 만든다. 불가하면 null. */
export function makeCloze(en: string): Cloze | null {
  const tokens = en.trim().split(/\s+/)
  if (tokens.length < 2) return null

  // 1순위: 전치사 ('to'는 맨 끝일 때만 — 부정사 to 회피)
  const prepCand: number[] = []
  tokens.forEach((tok, i) => {
    if (isPlaceholder(tok)) return
    const c = coreWord(tok)
    if (!PREPS.has(c)) return
    if (c === 'to' && i !== tokens.length - 1) return
    prepCand.push(i)
  })
  let blank = prepCand.length ? prepCand[prepCand.length - 1] : -1

  // 2순위: 내용어(첫 동사 추정) → 없으면 가장 긴 토큰
  if (blank === -1) {
    let firstContent = -1
    let longest = -1
    let longLen = 0
    tokens.forEach((tok, i) => {
      if (isPlaceholder(tok)) return
      const c = coreWord(tok)
      if (!c) return
      if (c.length > longLen) {
        longLen = c.length
        longest = i
      }
      if (STOP.has(c)) return
      if (c.length > 3 && c.endsWith('ly')) return // 부사 회피
      if (firstContent === -1) firstContent = i
    })
    blank = firstContent !== -1 ? firstContent : longest
  }

  if (blank === -1) return null
  const answer = coreWord(tokens[blank])
  if (!answer) return null
  return { tokens, blank, answer }
}

/** 주어진 단어가 (가림 대상) 전치사인지 */
export function isPreposition(word: string): boolean {
  return PREPS.has(normalize(word))
}

/** 입력이 정답과 일치하는가 (영/미 철자 변형 일부 허용) */
const VARIANTS: Record<string, string> = {
  toward: 'towards',
  towards: 'toward',
  amongst: 'among',
  among: 'amongst',
}
export function checkAnswer(input: string, answer: string): boolean {
  const a = normalize(input)
  const b = normalize(answer)
  if (!a) return false
  if (a === b) return true
  return VARIANTS[b] === a || VARIANTS[a] === b
}
