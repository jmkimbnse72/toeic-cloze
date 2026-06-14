# 토익 연어 — Cloze & 복습 (PWA)

토목 엔지니어를 위한 토익 연어(collocation) 학습 앱.
**빈칸 채우기(Cloze)** + **간격 반복(SRS)** 중심, 아이패드 홈 화면 설치형 PWA.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

아이패드에서 테스트: 같은 와이파이에서 `npm run dev -- --host` 로 켠 뒤,
아이패드 사파리로 접속 → **공유 → 홈 화면에 추가**.

## 기술 스택

- **Vite + React + TypeScript**
- **Tailwind CSS** — 디자인 토큰을 CSS 변수로 관리(`src/index.css`), 다크모드 `class` 전략
- **Dexie (IndexedDB)** — 덱/카드/복습/설정을 기기 안에 로컬 저장
- **vite-plugin-pwa** — 오프라인 캐시 + 홈 화면 설치

## 디자인 방향

아이덴티티 **"제도판(drafting table)"** — 토목 엔지니어에 맞춘 정밀·차분한 톤.

- 라이트: 벨럼 종이(`#fafaf8`) / 다크: 딥 슬레이트(`#14161a`)
- 단일 액센트: 딥 틸 `#0f766e`
- 타이포: Pretendard(한글/본문) · Space Grotesk(영어 표현=주인공) · JetBrains Mono(빈칸/데이터)
- 시그니처: **Cloze 빈칸을 제도 양식의 모노 밑줄칸**으로 표현

## 폴더 구조

```
src/
  data/toeic_decks.json   교정 완료된 시드 데이터 (20덱 · 513카드)
  db/
    schema.ts             Dexie 모델 (Deck/Card/Review/Setting)
    seed.ts               첫 실행 시 시드 적재 (학습기록은 보존)
  lib/
    srs.ts                SM-2 간격반복 엔진 (다음 단계에서 UI 연결)
    useTheme.ts           라이트/다크 토글
    useInstall.ts         설치 프롬프트 / iOS 안내
  screens/Home.tsx        1단계 확인 화면
  App.tsx, main.tsx
```

## 데이터 모델 (요약)

- `Deck` — id, name, date, order, cardCount
- `Card` — id, deckId, en, ko, tags[], order
- `Review` — cardId, state(new/learning/review), ease, interval, reps, lapses, due, lastReviewed
- `Setting` — key/value (테마·스트릭·일일 신규 한도 등)

## 로드맵

1. ✅ **프로젝트 셋업** — Vite + React + Tailwind + Dexie + PWA, 시드 적재·설치 확인
2. ✅ 카드 학습 UI — 덱 목록, 둘러보기(3모드 빈칸 확인), 진도 링
3. ✅ SRS 복습 — 4단계 평가 → due 계산, 복습/신규 큐
4. ✅ **토큰 Cloze** — 핵심어/전치사 자동 빈칸 + 인라인 타이핑(능동 인출), 채점 후 SRS
5. ✅ **4지선다** — Cloze 빈칸 기반 객관식(전치사↔전치사, 동사↔동사 오답으로 변별). 패러프레이즈는 보류(데이터 필요)
6. ✅ **약점 집중** — 틀린 카드(lapses>0)·북마크만 모아 드릴(일정 무관 전체 큐). TTS 음성 선택은 보류
7. ✅ **마감** — 통계·스트릭, 일일 신규 한도, TTS 음성·속도, 백업/복원(JSON)
8. ✅ **손글씨 메모** — 단어장 오른쪽 필기 패널(아이패드 분할). 색상·지우개·펜 두께, 영역 선택 후 삭제/복사/이동, 덱별 자동 저장

## 손글씨 메모 (components/NoteCanvas.tsx)

- 둘러보기(단어장) 화면의 **메모** 토글(공책 아이콘) — 아이패드(≥768px)에선 기본으로 오른쪽 분할, 좁은 화면에선 전체 오버레이
- 펜(필압 반영)·지우개(획 단위)·선택 3개 도구, 7색 팔레트(잉크는 테마색), 두께 3단계
- 선택 도구로 영역을 드래그 → **복사/삭제**, 선택 박스 안을 끌어 **이동**
- 실행취소(최대 40단계)·전체삭제, 벡터 스트로크로 **덱별 IndexedDB 저장**(오프라인·재방문 유지)

## 아이패드 실기 체크리스트

- [ ] `npm run dev -- --host` 후 아이패드 사파리로 Network 주소 접속
- [ ] 공유 → 홈 화면에 추가 → 전체화면 실행 확인
- [ ] 비행기모드(오프라인)에서 앱 실행·학습 가능 확인
- [ ] 빈칸 채우기: 입력 포커스/한영 키보드, 전치사 자동 대문자 안 됨 확인
- [ ] 4지선다·뒤집기 전환, 발음(TTS) 재생 확인
- [ ] 약점/북마크 집중 학습 동작
- [ ] 통계 스트릭·성숙도 갱신, 설정에서 백업 내보내기/가져오기
- [ ] 다크모드 전환 시 색·가독성

## 데이터/프라이버시

모든 학습 기록(복습 상태·북마크·활동·설정)은 **기기 안(IndexedDB·localStorage)** 에만 저장됩니다. 서버 전송·계정 없음. 기기 이동은 설정 → 백업 내보내기/가져오기로.

## Cloze 규칙 (lib/cloze.ts)

- 1순위 **전치사** 빈칸 (Part 5 직결). 부정사 `to`는 맨 끝일 때만 가려 `decide to recruit`의 `to`는 회피
- 전치사가 없으면 **핵심 내용어**(주로 동사)로 폴백, 부사·관사·대명사는 제외
- 513개 중 전치사 빈칸 52% · 내용어 폴백 48% · 불가 1개(단일어 'indeed' → 카드 뒤집기로 자동 대체)
- 채점은 대소문자·공백 무시, `toward/towards` 등 철자 변형 허용
