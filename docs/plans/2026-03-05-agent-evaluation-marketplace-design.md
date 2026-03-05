# 에이전트 복합 평가 프레임워크 + 마켓플레이스 통합 설계

## 개요

Claude Code 서브에이전트의 작업 성과를 **다차원 프로필**로 정량화하고, 이를 마켓플레이스에서 신뢰할 수 있는 수치로 공유하여 "에이전트를 위한 GitHub"을 구축하는 설계.

### 핵심 목표

1. **정량적 평가**: 품질·효율·신뢰·기여 4축으로 에이전트 성능을 수치화
2. **환경 컨텍스트 포함**: "어떤 조건에서 측정된 점수인지" 명시하여 이식성 문제 완화
3. **마켓플레이스 교류**: 측정된 성능 데이터가 붙은 에이전트를 공유/다운로드/비교

### 기존 시스템과의 관계

현재 구축된 시스템(Phase 1~3)을 기반으로 확장:
- Phase 1: Hook 자동 수집 + 스키마 검증 → **유지**
- Phase 2: LLM 평가 + 사용자 피드백 → **품질 축에 흡수**
- Phase 3: Registry (search/install/publish) → **성능 데이터 통합**
- Phase 4: 웹 UI 기획 → **프로필 카드 표시로 확장**

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                  복합 평가 프레임워크                           │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ 수집 계층  │  │  평가 엔진    │  │  프로필 생성기          │ │
│  │          │  │              │  │                        │ │
│  │ Pre Hook │  │ 품질 평가     │  │ 4축 프로필 계산         │ │
│  │ Post Hook│  │ 효율 평가     │  │ 환경 컨텍스트 첨부      │ │
│  │ 자동 수집 │  │ 신뢰 평가     │  │ 캐시 테이블 관리       │ │
│  │          │  │ 기여 평가     │  │ 시계열 스냅샷          │ │
│  └────┬─────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│       │               │                      │               │
│  ┌────▼───────────────▼──────────────────────▼─────────────┐ │
│  │              Local Data Layer (SQLite)                    │ │
│  │  agents | executions | evaluations | agent_profiles      │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                          │                                     │
│  ┌───────────────────────▼─────────────────────────────────┐ │
│  │              마켓플레이스 배포 계층                         │ │
│  │  publish: 프로필 → meta.json 병합                        │ │
│  │  install: 에이전트 + 게시자 프로필 다운로드                │ │
│  │  compare: 게시자 환경 vs 내 환경 성능 비교                │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 4축 평가 체계

### 축 1: 품질(Quality) — 가중치 0.35

에이전트 출력의 질적 수준을 측정.

| 항목 | 측정 방법 | 데이터 소스 |
|------|-----------|-------------|
| relevance | LLM(haiku) 평가 | evaluations 테이블 |
| depth | LLM(haiku) 평가 | evaluations 테이블 |
| actionability | LLM(haiku) 평가 | evaluations 테이블 |
| consistency | 동일 prompt_hash 출력의 구조적 유사도 | executions 테이블 자동 계산 |

**사용자 피드백 반영**: user 평가가 있으면 LLM 자동 점수를 보정하는 계수로 작동.

```
quality = (relevance + depth + actionability + consistency) / 4
if (user_feedback exists):
  quality = quality * 0.6 + user_score * 0.4
```

### 축 2: 효율(Efficiency) — 가중치 0.25

자원 사용 대비 성과를 측정. 모두 Hook에서 자동 수집.

| 항목 | 계산 방법 | 정규화 |
|------|-----------|--------|
| duration_normalized | 1 - (agent_avg / team_max) | 팀 내 상대 순위 |
| token_efficiency | 1 - (token_avg / team_max_token) | 팀 내 상대 순위 |
| cost_efficiency | quality_score / token_estimate | 절대값 정규화 |
| retry_rate | 1 - (retry_count / total_calls) | 절대값 |

**정규화 전략**: 효율은 절대값보다 **팀 내 상대 비교**가 의미 있음. security-auditor의 실행 시간은 같은 보안팀 에이전트와 비교해야지, docs-lead와 비교하면 무의미.

```
efficiency = (duration_norm + token_eff + cost_eff + (1 - retry_rate)) / 4
```

### 축 3: 신뢰(Reliability) — 가중치 0.25

출력의 안정성과 예측 가능성. 완전 자동 측정.

| 항목 | 계산 방법 |
|------|-----------|
| schema_compliance | SUM(schema_valid) / COUNT(*) over last N runs |
| failure_rate | 1 - (SUM(parse_failed) / COUNT(*)) |
| output_stability | 1 - (output_hash 분포의 정규화 엔트로피) |

```
reliability = schema_compliance * 0.4 + (1 - failure_rate) * 0.3 + output_stability * 0.3
```

### 축 4: 기여(Impact) — 가중치 0.15

파이프라인 내에서의 가치. MVP에서는 간접 지표 사용.

| 항목 | 계산 방법 | MVP 포함 |
|------|-----------|----------|
| usage_frequency | 호출 수 / 활성 세션 수 | O |
| pipeline_position | phase 가중치 (앞단 0.8, 뒷단 1.0) | O |
| downstream_dependency | 출력 참조하는 후속 에이전트 수 | X (Phase 5C) |

```
impact = usage_frequency_norm * 0.6 + pipeline_position_weight * 0.4
```

### 종합 프로필

```
composite = quality * 0.35 + efficiency * 0.25 + reliability * 0.25 + impact * 0.15
```

프로필 출력 형식:

```
┌─ security-auditor 성능 프로필 ──────────┐
│                                          │
│  품질     ████████░░ 0.85                │
│  효율     ██████░░░░ 0.62                │
│  신뢰     █████████░ 0.91                │
│  기여     ███████░░░ 0.73                │
│  ────────────────────                    │
│  종합     ████████░░ 0.79                │
│                                          │
│  환경: TypeScript/React, 보안 도메인     │
│  표본: 147회 실행, 최근 30일             │
│  모델: claude-sonnet-4-6                 │
└──────────────────────────────────────────┘
```

---

## 데이터 수집 파이프라인

### Hook 확장

현재 PostToolUse만 사용 → **PreToolUse 추가**하여 실행 시간 측정.

#### PreToolUse Hook (신규)

```
PreToolUse (Agent 도구 매칭)
  → 시작 타임스탬프를 /tmp/agent-timing-{pid}.json에 기록
  → 세션 내 호출 카운터 증가
```

#### PostToolUse Hook (확장)

```
PostToolUse (Agent 도구 매칭)
  → /tmp에서 시작 타임스탬프 읽기 → duration_ms 계산
  → output 문자수 → token_estimate 계산
  → 세션 내 호출 순서 기록
  → 프로젝트 타입 감지 (package.json, Cargo.toml 등)
  → 기존: schema 검증 + SQLite 저장
  → 확장: 효율/신뢰 메트릭 기록
```

#### settings.json 변경

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool": "Agent" },
        "command": "node .claude/hooks/pre-agent-timing.js"
      }
    ],
    "PostToolUse": [
      {
        "matcher": { "tool": "Agent" },
        "command": "node .claude/hooks/track-agent-execution.js"
      }
    ]
  }
}
```

### 프로젝트 타입 자동 감지

PostToolUse Hook에서 작업 디렉토리의 파일을 스캔:

| 파일 | 프로젝트 타입 |
|------|---------------|
| package.json + tsconfig.json | typescript |
| package.json (only) | javascript |
| Cargo.toml | rust |
| go.mod | go |
| requirements.txt / pyproject.toml | python |
| *.sol | solidity |

여러 개 매칭 시 우선순위 기반 선택. 감지 결과를 executions.project_type에 기록.

---

## DB 스키마 변경

### executions 테이블 확장

```sql
ALTER TABLE executions ADD COLUMN output_length INTEGER;
ALTER TABLE executions ADD COLUMN token_estimate INTEGER;
ALTER TABLE executions ADD COLUMN call_order INTEGER;
ALTER TABLE executions ADD COLUMN project_type TEXT;
ALTER TABLE executions ADD COLUMN model_version TEXT;
```

### 신규 테이블: agent_profiles

```sql
CREATE TABLE agent_profiles (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id),
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  period_start TEXT,
  period_end TEXT,
  context JSON,
  calculated_at TEXT,
  quality_details JSON,
  efficiency_details JSON,
  reliability_details JSON,
  impact_details JSON
);
```

### 신규 테이블: profile_history (추이 추적)

```sql
CREATE TABLE profile_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT REFERENCES agents(id),
  quality_score REAL,
  efficiency_score REAL,
  reliability_score REAL,
  impact_score REAL,
  composite_score REAL,
  sample_size INTEGER,
  snapshot_date TEXT,
  context JSON
);
```

### 마이그레이션 전략

기존 데이터와 하위 호환 유지:
- ALTER TABLE로 컬럼 추가 (기존 row는 NULL)
- 새 테이블은 CREATE IF NOT EXISTS
- db.js의 initDb()에서 마이그레이션 버전 관리

---

## CLI 확장

### 새 명령어

```bash
# 프로필 조회
agent-tracker profile show <agent-id>
agent-tracker profile show <agent-id> --json

# 프로필 재계산
agent-tracker profile refresh [agent-id]     # 특정 에이전트 또는 전체
agent-tracker profile refresh --period 30d   # 기간 지정

# 프로필 비교 (로컬 vs 게시자)
agent-tracker profile compare <agent-id>

# 팀 프로필
agent-tracker profile team <team-name>

# 프로필 추이
agent-tracker profile history <agent-id> --last 10
```

### 기존 명령어와의 관계

| 기존 명령어 | 변경 |
|------------|------|
| `stats <agent-id>` | 유지 — 기본 통계 (실행 횟수, 평균 시간) |
| `eval report <agent-id>` | 유지 — 평가별 상세 리포트 |
| `eval score <exec-id>` | 유지 — 개별 실행의 종합 스코어 |
| **신규** `profile show` | 4축 프로필 카드 표시 |
| **신규** `profile refresh` | 프로필 재계산 |

---

## 마켓플레이스 통합

### Publish 시 프로필 자동 포함

```bash
agent-tracker market publish .claude/agents/security-auditor.md
```

기존 publish 흐름에 프로필 데이터 병합:

```
1. 에이전트 .md 파일 읽기
2. agent_profiles 테이블에서 해당 에이전트 프로필 조회
3. meta.json에 performance 필드 추가
4. registry에 등록
```

### meta.json 확장

```json
{
  "name": "security-auditor",
  "version": "1.3.0",
  "description": "OWASP Top 10 기반 보안 취약점 분석",
  "author": "mufin",
  "license": "MIT",
  "tags": ["security", "owasp", "audit"],
  "model_recommendation": "sonnet",
  "performance": {
    "quality": 0.85,
    "efficiency": 0.62,
    "reliability": 0.91,
    "impact": 0.73,
    "composite": 0.79,
    "sample_size": 147,
    "context": {
      "project_types": ["typescript/react", "python/fastapi"],
      "domain": "security",
      "model": "claude-sonnet-4-6",
      "measured_period": "2026-01-15/2026-03-05"
    },
    "details": {
      "quality": {"relevance": 0.88, "depth": 0.82, "actionability": 0.86, "consistency": 0.84},
      "efficiency": {"avg_duration_ms": 45000, "avg_tokens": 2100, "retry_rate": 0.03},
      "reliability": {"schema_compliance": 0.98, "failure_rate": 0.01, "output_stability": 0.85}
    }
  }
}
```

### Install 후 비교 기능

```bash
agent-tracker market install security-auditor
# → .claude/agents/security-auditor.md 복사
# → 게시자 프로필을 로컬 DB에 reference로 저장

# 사용 후 비교
agent-tracker profile compare security-auditor
# → 게시자 프로필 vs 내 로컬 프로필 나란히 표시
```

---

## 제약사항과 현실성

### 기술적 제약

| 제약 | 영향 | 대응 |
|------|------|------|
| Hook에서 토큰 수 미제공 | 효율 측정이 근사치 | 문자수 기반 추정, 상대 비교에 집중 |
| PreToolUse 타이밍 정확도 | Hook 오버헤드 포함 | ±수백ms 오차, 에이전트 단위(초~분)에서 무시 가능 |
| session_id 미보장 | CLAUDE_SESSION_ID 환경변수 없을 수 있음 | 타임스탬프 기반 pseudo-session 그룹핑 |
| 파이프라인 외 단독 실행 | pipeline_phase가 null | impact 축에서 usage_frequency만 사용 |
| 모델 버전 변경 | 동일 에이전트 성능 변동 | context에 model_version 기록, 버전별 분리 조회 |

### 플랫폼 제약

| 제약 | 영향 | 대응 |
|------|------|------|
| Claude Code Hook 스펙 변경 | stdin 포맷 변동 가능 | hook-parser.js 버전별 분기 |
| SQLite 동시 쓰기 | 병렬 에이전트 실행 시 lock | WAL 모드 활성화 |
| 레지스트리가 로컬 JSON | 중앙 검색/랭킹 불가 | GitHub repo 기반 레지스트리, PR 제출 |

### 성능 고려

| 항목 | 예상 부하 | 대응 |
|------|-----------|------|
| Hook 실행 시간 | ~50ms/호출 추가 | 비동기 기록, 에이전트 블로킹 없음 |
| 프로필 재계산 | 68 에이전트 × 수천 row | agent_profiles 캐시, 요청 시 갱신 |
| 레지스트리 크기 | 68개 = ~200KB | 1000개까지 수 MB, 문제 없음 |

### 점수 신뢰성 문제

| 문제 | 대응 |
|------|------|
| 자체 측정 점수의 객관성 | 환경 컨텍스트 필수 포함, "조건부 점수"로 표시 |
| Goodhart 법칙 (점수 게이밍) | 사용자 리뷰 가중치 높게, 자동 점수만으로 순위 결정 안 함 |
| LLM-as-judge 편향 | 평가 모델(haiku)과 실행 모델(sonnet/opus) 분리 유지 |
| 환경 의존성 | project_type + domain + model을 점수와 함께 표시 |

---

## 구현 로드맵

### Phase 5A: 복합 평가 엔진 (이번 구현 범위)

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | PreToolUse Hook 작성 | .claude/hooks/pre-agent-timing.js |
| 2 | PostToolUse Hook 확장 | track-agent-execution.js 수정 |
| 3 | DB 마이그레이션 | db.js에 스키마 확장 |
| 4 | 프로필 계산 엔진 | marketplace/src/profiler.js |
| 5 | CLI profile 명령어 | bin/agent-tracker.js 확장 |
| 6 | 테스트 | tests/profiler.test.js |

### Phase 5B: 마켓 성능 데이터 통합

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | publish에 프로필 병합 | packager.js 수정 |
| 2 | meta.json 스키마 확장 | performance 필드 추가 |
| 3 | install 후 reference 저장 | installer.js 수정 |
| 4 | profile compare 구현 | profiler.js + cli.js |
| 5 | registry 성능 기반 정렬 | registry.js 수정 |

### Phase 5C: 벤치마크 레이어 (선택적 확장)

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | 역할별 표준 시나리오 설계 | benchmarks/scenarios/ |
| 2 | 벤치마크 실행기 | marketplace/src/benchmark.js |
| 3 | 벤치마크 결과 → 프로필 반영 | profiler.js 확장 |
| 4 | 마켓에서 벤치마크 점수 표시 | meta.json + registry |

---

## 디렉토리 구조 변경

```
marketplace/
  src/
    db.js              # 스키마 확장 (ALTER + CREATE)
    tracker.js         # 확장 필드 기록
    evaluator.js       # 유지
    profiler.js        # 신규: 4축 프로필 계산 엔진
    cli.js             # profile 명령어 추가
    hook-parser.js     # 확장 필드 파싱
    packager.js        # 프로필 병합 로직
    registry.js        # 성능 기반 정렬
    installer.js       # 게시자 프로필 저장
    ...

.claude/
  hooks/
    pre-agent-timing.js    # 신규: PreToolUse 타이밍
    track-agent-execution.js  # 확장: 효율 메트릭 수집
  settings.json            # PreToolUse Hook 등록
```
