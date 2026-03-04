# Agent Marketplace Phase 4: 웹 UI 기획문서

## 개요

에이전트 마켓플레이스의 웹 인터페이스. 로컬 SQLite 데이터와 레지스트리를 정적 사이트로 빌드하여 에이전트를 탐색, 비교, 설치할 수 있는 UI를 제공한다.

## 목표

1. **에이전트 탐색**: 검색/필터/정렬로 에이전트를 쉽게 찾을 수 있다
2. **성능 시각화**: 각 에이전트의 실행 이력, 점수 추이를 차트로 보여준다
3. **비교**: 같은 팀/역할의 에이전트를 나란히 비교할 수 있다
4. **원클릭 설치**: CLI 명령어를 복사하거나 직접 설치를 트리거할 수 있다
5. **커뮤니티**: 사용자 리뷰와 평점을 볼 수 있다

## 아키텍처

### 접근법: 정적 사이트 생성 (SSG)

```
┌──────────────────────────────────────────────────┐
│                  빌드 파이프라인                     │
│                                                    │
│  SQLite DB ─┐                                      │
│              ├─→ JSON 데이터 추출 ─→ 정적 사이트 빌드  │
│  registry/ ──┘                                      │
│                                                    │
│  결과: dist/ (HTML + JS + CSS)                      │
│        → GitHub Pages / Vercel 배포                 │
└──────────────────────────────────────────────────┘
```

**왜 정적 사이트인가:**
- 서버 운영 비용 없음
- GitHub Pages 무료 호스팅
- 빌드 시 데이터 스냅샷 → CDN 캐싱 가능
- 오프라인에서도 로컬 서버로 확인 가능

### 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Astro | 정적 우선, 부분 하이드레이션으로 JS 최소화 |
| UI | React + Tailwind CSS | 인터랙티브 컴포넌트만 React, 나머지는 정적 HTML |
| 차트 | Chart.js (react-chartjs-2) | 가벼움, 라인/바/레이더 차트 지원 |
| 검색 | Fuse.js | 클라이언트 사이드 퍼지 검색, 서버 불필요 |
| 배포 | GitHub Pages | 무료, CI/CD 연동 쉬움 |

### 대안 검토

| 접근법 | 장점 | 단점 | 판정 |
|--------|------|------|------|
| **Astro SSG** | JS 최소, 빠름, 부분 하이드레이션 | 동적 기능 제한 | **채택** |
| Next.js SSG | 풍부한 생태계 | 번들 크기 큼, 과다 스펙 | 기각 |
| Vanilla HTML + JS | 의존성 없음 | 개발 속도 느림, 컴포넌트 재사용 어려움 | 기각 |
| SPA (Vite + React) | 완전한 동적 UI | SEO 불리, 초기 로딩 느림 | 기각 |

## 페이지 구조

```
/                          # 홈: 주요 지표 대시보드 + 인기 에이전트
/agents                    # 에이전트 목록 (검색/필터/정렬)
/agents/[name]             # 에이전트 상세 (설명, 점수, 실행 이력)
/agents/[name]/versions    # 버전 히스토리
/teams                     # 팀별 보기
/teams/[team]              # 팀 소속 에이전트 목록 + 팀 성능
/leaderboard               # 랭킹 (팀별, 전체, 카테고리별)
/compare                   # 에이전트 비교 도구
```

## 핵심 화면 상세

### 1. 홈 대시보드 (`/`)

```
┌─────────────────────────────────────────────────┐
│  Agent Marketplace                    [검색바]   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │ 68   │ │ 1.2K │ │ 0.84 │ │ 10   │           │
│  │에이전트│ │총 실행│ │평균점수│ │ 팀   │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                  │
│  인기 에이전트              최근 업데이트           │
│  ┌────────────────┐  ┌────────────────┐         │
│  │ security-auditor│  │ code-reviewer   │         │
│  │ ★ 0.92  147회  │  │ v1.3.0 updated │         │
│  └────────────────┘  └────────────────┘         │
│  ┌────────────────┐  ┌────────────────┐         │
│  │ code-architect  │  │ threat-intel    │         │
│  │ ★ 0.88  89회   │  │ v1.1.0 updated │         │
│  └────────────────┘  └────────────────┘         │
└─────────────────────────────────────────────────┘
```

### 2. 에이전트 목록 (`/agents`)

**필터/정렬 옵션:**
- 팀: security, research, code, testing, ...
- 모델: opus, sonnet, haiku
- 점수 범위: 슬라이더 (0.0 ~ 1.0)
- 정렬: 점수순, 실행 횟수순, 최근 업데이트순, 이름순

**카드 레이아웃:**
```
┌──────────────────────────────┐
│ 🔒 security-auditor    v1.2 │
│ OWASP Top 10 보안 취약점 분석  │
│                              │
│ ★ 0.92  │ 147회  │ sonnet   │
│ tags: security, owasp, audit │
│                              │
│ [설치] [상세보기] [비교에 추가] │
└──────────────────────────────┘
```

### 3. 에이전트 상세 (`/agents/[name]`)

```
┌─────────────────────────────────────────────────┐
│  security-auditor                    v1.2.0     │
│  OWASP Top 10 기반 보안 취약점 분석                │
│  by mufin │ MIT │ team: security │ model: sonnet│
├─────────────────────────────────────────────────┤
│                                                  │
│  [개요] [점수 추이] [실행 이력] [버전] [설치]      │
│                                                  │
│  ┌─ 종합 점수 ──────────────────────────────┐   │
│  │                                          │   │
│  │  Schema: ████████████ 0.98               │   │
│  │  LLM:    █████████░░ 0.85               │   │
│  │  User:   ████████░░░ 0.80               │   │
│  │  ─────────────────────                   │   │
│  │  Composite: 0.87                         │   │
│  │                                          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌─ 점수 추이 (최근 30일) ──────────────────┐   │
│  │     *                                     │   │
│  │   *   * *   *                             │   │
│  │  *         *   * *  *                     │   │
│  │                       * *                 │   │
│  │  0.7 ──────────────────── 1.0             │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  설치: agent-tracker market install security-... │
│  [📋 복사]                                       │
│                                                  │
│  ┌─ 레이더 차트 ────────┐                        │
│  │    관련성              │                        │
│  │   /    \              │                        │
│  │ 일관성   깊이          │                        │
│  │   \    /              │                        │
│  │  실행가능성            │                        │
│  └──────────────────────┘                        │
└─────────────────────────────────────────────────┘
```

### 4. 비교 도구 (`/compare`)

최대 3개 에이전트를 나란히 비교:

```
┌─────────────────────────────────────────────────┐
│  에이전트 비교                                    │
│  [security-auditor ▼] vs [api-security ▼] vs [+]│
├───────────┬─────────────┬──────────────┬────────┤
│  항목      │ sec-auditor │ api-security │        │
├───────────┼─────────────┼──────────────┤        │
│  종합점수  │ 0.87        │ 0.82         │        │
│  실행횟수  │ 147         │ 63           │        │
│  모델      │ sonnet      │ sonnet       │        │
│  관련성    │ 0.92        │ 0.88         │        │
│  깊이      │ 0.85        │ 0.79         │        │
│  실행가능성│ 0.90        │ 0.85         │        │
│  일관성    │ 0.82        │ 0.76         │        │
├───────────┴─────────────┴──────────────┘        │
│                                                  │
│  ┌─ 레이더 차트 오버레이 ──────────────────────┐ │
│  │     (두 에이전트 레이더 겹쳐서 표시)         │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 5. 리더보드 (`/leaderboard`)

```
┌─────────────────────────────────────────────────┐
│  리더보드          [전체 ▼] [최근 30일 ▼]        │
├─────────────────────────────────────────────────┤
│  # │ 에이전트            │ 점수 │ 실행 │ 팀     │
│  1 │ security-auditor    │ 0.92 │ 147 │ security│
│  2 │ code-reviewer-impl  │ 0.90 │ 203 │ code   │
│  3 │ research-lead       │ 0.88 │ 89  │ research│
│  ...                                             │
├─────────────────────────────────────────────────┤
│  팀 순위                                         │
│  1. security (avg 0.86) │ 2. code (avg 0.84)    │
│  3. research (avg 0.82) │ 4. testing (avg 0.80) │
└─────────────────────────────────────────────────┘
```

## 데이터 파이프라인

### 빌드 시 데이터 추출

```
marketplace/src/data-export.js
```

SQLite + registry.json → 정적 JSON 파일 생성:

```
web/src/data/
├── agents.json           # 모든 에이전트 메타 + 최신 점수
├── stats/
│   ├── security-auditor.json   # 개별 에이전트 상세 통계
│   ├── code-reviewer.json
│   └── ...
├── teams.json            # 팀별 집계
├── leaderboard.json      # 랭킹 데이터
└── summary.json          # 대시보드용 전체 요약
```

**데이터 추출 스크립트:**

```js
// marketplace/src/data-export.js
// 역할: SQLite DB + registry.json → web/src/data/*.json

export function exportDashboardData(db, registry) {
  // agents.json: 에이전트별 { name, description, version, score, executions, team, model }
  // teams.json: 팀별 { name, agent_count, avg_score, total_executions }
  // leaderboard.json: 점수 순위
  // summary.json: { total_agents, total_executions, avg_score, team_count }
}

export function exportAgentDetail(db, agentId) {
  // stats/{agentId}.json:
  // { scores: [...], executions: [...], score_trend: [...], radar: {...} }
}
```

### 빌드 흐름

```bash
# 1. 데이터 추출
node marketplace/bin/agent-tracker.js export-data --output web/src/data/

# 2. 사이트 빌드
cd web && npm run build

# 3. 배포
# GitHub Actions에서 자동 또는 수동
```

## 디렉토리 구조

```
web/
├── astro.config.mjs
├── package.json
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro       # 공통 레이아웃 (nav, footer)
│   ├── pages/
│   │   ├── index.astro            # 홈 대시보드
│   │   ├── agents/
│   │   │   ├── index.astro        # 에이전트 목록
│   │   │   └── [name].astro       # 에이전트 상세
│   │   ├── teams/
│   │   │   ├── index.astro        # 팀 목록
│   │   │   └── [team].astro       # 팀 상세
│   │   ├── leaderboard.astro      # 리더보드
│   │   └── compare.astro          # 비교 도구
│   ├── components/
│   │   ├── AgentCard.astro        # 에이전트 카드 (정적)
│   │   ├── SearchBar.tsx          # 검색 (React, 클라이언트)
│   │   ├── ScoreChart.tsx         # 점수 추이 차트 (React)
│   │   ├── RadarChart.tsx         # 레이더 차트 (React)
│   │   ├── CompareTable.tsx       # 비교 테이블 (React)
│   │   ├── FilterPanel.tsx        # 필터 패널 (React)
│   │   ├── ScoreBar.astro         # 점수 바 (정적)
│   │   ├── StatCard.astro         # 통계 카드 (정적)
│   │   └── InstallCommand.astro   # 설치 명령어 + 복사 버튼
│   ├── data/                      # 빌드 시 생성되는 JSON (gitignore)
│   └── styles/
│       └── global.css             # Tailwind 진입점
├── public/
│   └── favicon.svg
└── tailwind.config.cjs
```

## 인터랙티브 기능

### 클라이언트 사이드 검색 (Fuse.js)

```
사용자 입력 → Fuse.js로 agents.json 퍼지 검색 → 결과 즉시 렌더링
```

- 이름, 설명, 태그 모두 검색 대상
- 디바운스 300ms
- 최대 20개 결과 표시

### 필터 상태 관리

URL 쿼리 파라미터로 필터 상태 유지:
```
/agents?team=security&model=sonnet&sort=score&min=0.7
```

뒤로가기/공유 시 필터 유지됨.

### 설치 명령어 복사

```astro
<!-- InstallCommand.astro -->
<div class="install-cmd">
  <code>agent-tracker market install {name}</code>
  <button onclick="navigator.clipboard.writeText(...)">📋</button>
</div>
```

## CI/CD 자동 배포

```yaml
# .github/workflows/deploy-marketplace.yml
name: Deploy Marketplace

on:
  push:
    paths:
      - 'marketplace/**'
      - '.claude/agents/**'
  schedule:
    - cron: '0 0 * * 0'  # 매주 일요일 자정

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci --prefix marketplace
      - run: node marketplace/bin/agent-tracker.js export-data --output web/src/data/
      - run: npm ci --prefix web && npm run build --prefix web
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: web/dist
```

## 향후 확장 가능성

### 커뮤니티 기능 (Phase 5 후보)

| 기능 | 설명 | 구현 방식 |
|------|------|-----------|
| 사용자 리뷰 | 에이전트별 리뷰 작성/조회 | GitHub Discussions API |
| 에이전트 제출 | 외부 사용자가 에이전트 제출 | GitHub PR 기반 |
| 알림 | 에이전트 업데이트 알림 | GitHub Watch + RSS |
| 벤치마크 | 표준 시나리오로 성능 비교 | CI에서 자동 실행 |
| 배지 | README에 삽입할 점수 배지 | shields.io 스타일 SVG 생성 |

### 로컬 대시보드 모드

서버 없이 로컬에서 대시보드를 볼 수 있는 모드:

```bash
agent-tracker dashboard
# → localhost:3456에서 로컬 SQLite 데이터로 대시보드 표시
```

이 모드는 Astro dev server를 활용하며, 데이터를 실시간으로 SQLite에서 읽어온다.

## 제약사항 및 전제

- 데이터는 빌드 시점 스냅샷 (실시간 아님)
- 첫 버전은 읽기 전용 (리뷰/제출은 GitHub 기반)
- 에이전트 68개 기준 설계 (1000개 이상 시 페이지네이션 필요)
- 모바일 반응형은 기본 지원하되, 비교 도구는 데스크톱 우선
