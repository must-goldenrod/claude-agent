# Agent Marketplace 설계 문서

## 개요

Claude Code 서브에이전트의 성능을 자동 추적하고, 품질을 평가하며, 버전 관리와 공유가 가능한 오픈소스 에이전트 마켓플레이스 시스템.

## 요구사항

- **대상**: 오픈소스 커뮤니티
- **품질 평가**: 자동 검증 + LLM 평가 + 사용자 피드백 복합
- **저장소**: 로컬 파일 기반 (SQLite)
- **배포**: Git 기반 (npm 스타일)
- **MVP 초점**: 성능 추적 우선

## 아키텍처

### 접근법: Hook 자동 수집 + 오케스트레이터 내장 텔레메트리 하이브리드

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Marketplace                      │
│                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Registry │  │  Tracker     │  │  Evaluator        │  │
│  │          │  │              │  │                   │  │
│  │ • 검색    │  │ • Hook 수집  │  │ • 스키마 검증     │  │
│  │ • 설치    │  │ • 실행 로그   │  │ • LLM 평가       │  │
│  │ • 버전    │  │ • 메트릭 축적 │  │ • 사용자 피드백   │  │
│  │ • 공유    │  │ • SQLite DB  │  │ • 종합 스코어     │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│        ↕              ↕                  ↕               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Local Data Layer (SQLite)               │ │
│  │  agents | executions | evaluations | versions       │ │
│  └─────────────────────────────────────────────────────┘ │
│        ↕                                                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           Git-based Distribution Layer              │ │
│  │  agent-registry.json + GitHub Releases              │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**3개의 핵심 컴포넌트:**
1. **Registry** — 에이전트 카탈로그, 검색, 설치, 버전 관리
2. **Tracker** — 실행 자동 수집 (Hook), 메트릭 축적
3. **Evaluator** — 3단계 품질 평가 (자동검증 + LLM + 사용자)

## 컴포넌트 1: Tracker (Hook 기반 실행 수집)

### Hook 설정

```jsonc
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool": "Agent" },
        "command": "node .claude/hooks/track-agent-execution.js"
      }
    ]
  }
}
```

### 수집 데이터

| 필드 | 소스 | 설명 |
|------|------|------|
| `agent_name` | tool_input.subagent_type | 어떤 에이전트인지 |
| `model` | tool_input.model | 사용된 모델 |
| `prompt_preview` | tool_input.prompt (앞 200자) | 입력 요약 |
| `output_preview` | tool_output (앞 500자) | 출력 요약 |
| `timestamp` | hook 실행 시각 | 언제 실행했는지 |
| `duration_ms` | 추정 (hook 타이밍) | 실행 시간 |
| `session_id` | 환경변수 | 같은 세션 그룹핑 |
| `pipeline_phase` | output 디렉토리 분석 | 파이프라인 맥락 |

### SQLite 스키마

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  source_path TEXT,
  team TEXT,
  model TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT REFERENCES agents(id),
  session_id TEXT,
  pipeline_phase TEXT,
  prompt_hash TEXT,
  output_hash TEXT,
  output_schema_valid BOOLEAN,
  duration_ms INTEGER,
  timestamp TEXT,
  metadata JSON
);

CREATE TABLE evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER REFERENCES executions(id),
  eval_type TEXT,                -- "schema"|"llm"|"user"
  score REAL,                    -- 0.0 ~ 1.0
  details JSON,
  evaluator TEXT,
  timestamp TEXT
);

CREATE TABLE agent_versions (
  agent_id TEXT REFERENCES agents(id),
  version TEXT,
  content_hash TEXT,
  changelog TEXT,
  avg_score REAL,
  execution_count INTEGER,
  released_at TEXT,
  PRIMARY KEY (agent_id, version)
);
```

## 컴포넌트 2: Evaluator (3단계 품질 평가)

### Level 1: 자동 스키마 검증 (즉시, 모든 실행)

Hook 수집 시 즉시 실행:
- JSON 파싱 가능 여부
- 필수 필드 존재 (`agent`, `team`, `phase`, `findings`, `confidence_score`)
- 값 범위 검증 (`confidence_score` 0~1, `severity` enum 등)
- 팀별 확장 필드 검증

결과: `schema_score` (0.0 ~ 1.0)

### Level 2: LLM 기반 평가 (배치, 선택적)

```bash
agent-eval llm --agent security-auditor --last 10
```

평가 기준:
- **관련성** (0~1): 입력에 대해 적절한 분석을 했는가
- **깊이** (0~1): 피상적이지 않고 구체적인가
- **실행가능성** (0~1): 추천사항이 실제로 수행 가능한가
- **일관성** (0~1): 같은 입력에 대해 안정적인 출력을 내는가

평가자 모델: haiku (비용 효율)

### Level 3: 사용자 피드백 (수동)

```bash
agent-eval rate <execution-id> --score 0.8 --comment "분석은 좋지만 대안 부족"
agent-eval rate --agent security-auditor --last 5
```

### 종합 스코어

```
사용자 피드백 있을 때: total = schema(0.2) + llm(0.4) + user(0.4)
사용자 피드백 없을 때: total = schema(0.3) + llm(0.7)
```

## 컴포넌트 3: Registry (에이전트 배포 & 마켓플레이스)

### 에이전트 패키지 구조

```
my-agent/
├── agent.md              # 에이전트 정의 (frontmatter + 프롬프트)
├── agent.meta.json       # 마켓플레이스 메타데이터
├── benchmarks/           # 벤치마크 시나리오 (선택)
│   ├── scenario-1.json
│   └── scenario-2.json
└── CHANGELOG.md
```

### agent.meta.json

```json
{
  "name": "security-auditor",
  "display_name": "Security Auditor",
  "version": "1.2.0",
  "description": "OWASP Top 10 기반 보안 취약점 분석",
  "author": "mufin",
  "license": "MIT",
  "tags": ["security", "owasp", "audit"],
  "team_compatibility": ["security"],
  "model_recommendation": "sonnet",
  "avg_score": 0.82,
  "total_executions": 147,
  "dependencies": [],
  "claude_code_version": ">=1.0.0"
}
```

### Git 기반 레지스트리

중앙 레지스트리 = GitHub 레포 (`agent-registry`)

```
agent-registry/
├── registry.json          # 모든 에이전트 인덱스
├── agents/
│   ├── security-auditor/
│   │   ├── agent.md
│   │   ├── agent.meta.json
│   │   └── benchmarks/
│   └── ...
└── schemas/
    └── meta-schema.json
```

### CLI 명령어

```bash
agent-market search "security"
agent-market search --tag owasp --min-score 0.7
agent-market install security-auditor
agent-market install security-auditor@1.2.0
agent-market publish security-auditor
agent-market outdated
agent-market upgrade security-auditor
agent-market stats security-auditor
agent-market leaderboard --team security
```

## 오케스트레이터 통합

파이프라인 실행 시 자동 메트릭 기록:

```json
// output/{phase}/pipeline-metrics.json
{
  "phase": "implementation",
  "started_at": "2026-03-04T10:00:00Z",
  "completed_at": "2026-03-04T10:45:00Z",
  "teams": {
    "research": {
      "duration_ms": 120000,
      "members_called": 5,
      "quality_gate": "pass",
      "retry_count": 0
    }
  },
  "total_agent_calls": 32,
  "total_duration_ms": 2700000,
  "cost_estimate": {
    "opus_calls": 8,
    "sonnet_calls": 24
  }
}
```

## 구현 로드맵

| Phase | 컴포넌트 | 설명 |
|-------|----------|------|
| **Phase 1 (MVP)** | Tracker + Evaluator L1 | Hook 자동 수집 + 스키마 검증 + SQLite 저장 |
| **Phase 2** | Evaluator L2/L3 + 오케스트레이터 통합 | LLM 평가 + 사용자 피드백 + 파이프라인 메트릭 |
| **Phase 3** | Registry | 에이전트 패키징 + Git 레지스트리 + CLI 설치 |
| **Phase 4** | 마켓플레이스 웹 | 정적 사이트로 에이전트 탐색/검색 UI |

## 기술 스택

- **Hook 스크립트**: Node.js (Claude Code 환경에 이미 존재)
- **DB**: SQLite (better-sqlite3)
- **CLI**: Node.js CLI (commander.js)
- **레지스트리**: GitHub 레포 + GitHub API
- **웹 (미래)**: 정적 사이트 생성기 (GitHub Pages)
