# Claude Agent Harness

Claude Code 서브에이전트 69개를 11개 팀으로 구조화하고, 하네스 엔지니어링 패턴을 적용한 멀티에이전트 파이프라인.

**69 에이전트** | **11 팀** | **3단계 모델 라우팅** (Opus/Sonnet/Haiku) | **보안 훅** | **PROACTIVE 자동 위임**

---

## 무엇을 하는 프로젝트인가

Claude Code의 서브에이전트 시스템을 활용하여, 하나의 프롬프트로 **조사 → 토론 → 종합 → 품질검증 → 보안감사**를 자동 수행하는 멀티에이전트 파이프라인입니다.

```
사용자: /orchestrator "결제 모듈 설계"

  조사팀 (5명 병렬) → 토론팀 (3라운드 × 6명) → 종합팀 (7명 병렬)
                                                        ↓
                                                  품질팀 (Go/No-Go)
                                                        ↓
                                              보안팀 (15명 병렬, 구현 단계)
```

---

## 빠른 시작

### 전역 설치 (권장)

```bash
git clone https://github.com/your-username/claude-agent.git
cd claude-agent
./install.sh
```

설치 완료 후 **어떤 프로젝트에서든** Claude Code에서 바로 사용:

```bash
# 멀티에이전트 파이프라인 실행
/orchestrator "여행 예약 시스템의 결제 모듈 설계"

# 개별 에이전트는 PROACTIVE 트리거로 자동 호출됨
# (예: 코드 작성 → code-reviewer-impl 자동 실행)
```

### 설치 관리

```bash
./install.sh install    # 설치 (기존 에이전트 자동 백업)
./install.sh verify     # 설치 상태 검증
./install.sh uninstall  # 제거 (원래 에이전트 유지)
```

### Claude Code에 설치 위임

Claude Code 세션에서 직접 시킬 수도 있습니다:

```
이 레포의 install.sh를 실행해서 전역에 에이전트를 설치해줘
```

### 부분 설치 (에이전트만)

오케스트레이터 없이 개별 에이전트만 설치:

```bash
# 보안 에이전트만
cp .claude/agents/{security-auditor,secrets-scanner,dependency-scanner}.md ~/.claude/agents/

# 구현 에이전트만
cp .claude/agents/{backend-developer,frontend-developer,code-architect}.md ~/.claude/agents/
```

PROACTIVE 트리거가 적용되어 있어, 복사만 하면 Claude Code가 상황에 맞는 에이전트를 **자동으로 선택**합니다.

> 상세 설치 옵션: [docs/global-installation-guide.md](docs/global-installation-guide.md)

---

## 아키텍처

### 팀 구조 (69 에이전트)

| 팀 | 에이전트 수 | 리더 모델 | 멤버 모델 | 역할 |
|---|-----------|----------|----------|------|
| 조사 | 6 | opus | sonnet | 웹 조사, 시장/기술/트렌드/경쟁사 분석 |
| 토론 | 8 | opus | sonnet | 6명 3라운드 토론 + moderator 종합 |
| 종합 | 8 | opus | sonnet | 통합, 전략, 리스크, KPI, 실행계획 |
| 품질 | 5 | opus | haiku/sonnet | 사실검증, 논리검증, 편향검출, Go/No-Go |
| 코드 | 6 | opus | sonnet | 아키텍처, 프론트/백엔드, 리뷰, 리팩터 |
| 테스트 | 4 | opus | haiku/sonnet | 유닛/통합 테스트 작성 + 실행 |
| 보안 | 16 | opus | sonnet | OWASP, CVE, 시크릿, IaC, 공급망 등 15개 영역 |
| DevOps | 6 | opus | sonnet | Git 전략, 릴리스, PR, CI/CD |
| DB | 3 | opus | sonnet | 스키마 설계, 마이그레이션 |
| 인프라 | 3 | opus | haiku/sonnet | Dockerfile, Terraform, IaC |
| 문서 | 3 | opus | haiku/sonnet | API 문서, 사용자 가이드 |
| 메타 | 1 | - | sonnet | harness-optimizer (성능 분석) |

### 파일 기반 오케스트레이션

Claude Code의 서브에이전트는 다른 서브에이전트를 호출할 수 없습니다 (깊이=1 제약). 이를 우회하기 위해 **파일 시스템을 통한 간접 통신**을 사용합니다:

1. 팀 리더가 `output/{phase}/{team}/` 경로에 지시서 작성
2. 메인이 팀원 에이전트를 병렬 호출
3. 팀원이 결과를 같은 디렉토리에 JSON으로 Write
4. 팀 리더를 resume하여 결과 종합

### 모델 라우팅

| 모델 | 수 | 용도 |
|------|---|------|
| Opus | 18 | 팀 리더, 최종 리뷰어 — 복잡 추론 |
| Sonnet | 47 | 전문 작업 수행 |
| Haiku | 4 | test-runner, containerizer, guide-writer, fact-checker |

---

## 하네스 엔지니어링

[harness strategy report](docs/plans/2026-03-24-harness-engineering-implementation.md) 기반으로 적용된 5가지 패턴:

### 1. PROACTIVE 트리거 (69/69 에이전트)

모든 에이전트 description에 자동 위임 패턴 적용:

```
Use PROACTIVELY when <트리거 조건>. NOT FOR: <부정 조건>.
```

예시:
- `security-auditor`: *"Use PROACTIVELY when code needs OWASP Top 10 vulnerability review. NOT FOR: code implementation, style review."*
- `backend-developer`: *"Use PROACTIVELY when task assignments include API endpoints. NOT FOR: frontend components, CSS styling."*

### 2. 보안 훅 파이프라인

`pre-security-gate.js`가 Write/Edit/Bash 호출을 실시간 검사:

| 검사 | 대상 | 차단 예시 |
|------|------|----------|
| 보호 파일 | Write, Edit | `.claude/settings.json`, `CLAUDE.md`, `.env` |
| 시크릿 패턴 | Write, Edit | `api_key: "sk_live_..."`, Private Key |
| 위험 명령 | Bash | `rm -rf`, `git push --force`, `DROP TABLE` |

```bash
# 운영 모드 전환
export HARNESS_HOOK_PROFILE=standard  # 경고만 (기본)
export HARNESS_HOOK_PROFILE=strict    # 실제 차단
export HARNESS_HOOK_PROFILE=minimal   # Bash만 검사
```

### 3. 3단계 모델 라우팅

Opus(복잡 추론) → Sonnet(루틴 작업) → Haiku(단순 체크)로 비용 최적화.

### 4. 크로스세션 학습 (memory:project)

5개 팀 리더에 `memory: project` 필드 적용. 세션 간 학습 데이터가 `.claude/agent-memory/`에 자동 저장됩니다.

### 5. harness-optimizer 메타 에이전트

에이전트 성능을 분석하고 개선안을 생성하는 69번째 에이전트.

---

## 디렉토리 구조

```
.claude/
  agents/              # 69개 에이전트 정의 (.md)
  hooks/
    pre-security-gate.js   # 보안 훅 (보호 파일, 시크릿, 위험 명령 차단)
    pre-agent-timing.js    # 실행 시간 측정
    track-agent-execution.js  # 실행 기록
  skills/
    orchestrator/          # 멀티팀 파이프라인 오케스트레이터
  settings.json            # Hook 등록

agents/
  schemas/output-format.md   # 에이전트 공통 출력 JSON 스키마
  templates/basic-agent.md   # 새 에이전트 작성 템플릿

catalog/
  taxonomy.md              # 11개 카테고리별 에이전트 매핑

docs/
  plans/                   # 설계 문서
  research/                # 서브에이전트 시스템 기술 연구
  global-installation-guide.md  # 전역 설치 가이드
```

---

## 에이전트 추가/수정

`agents/templates/basic-agent.md`를 참고하여 `.claude/agents/`에 생성:

```yaml
---
name: my-agent
description: <역할>. Use PROACTIVELY when <조건>. NOT FOR: <제외>.
tools: Read, Grep, Glob
model: sonnet
color: blue
---

# My Agent

<example>
Context: When this situation occurs
user: "example user message"
assistant: "I'll use the my-agent agent to handle this"
</example>

## System Prompt

You are a specialized agent that [purpose].
```

**규칙:**
- 에이전트 정의는 영어로 작성 (Claude Code 호환)
- 출력은 `agents/schemas/output-format.md` JSON 포맷 준수
- 팀 리더: `opus` / 팀원: `sonnet` / 단순 작업: `haiku`

---

## 설치 시 알아둘 것

### 무엇이 설치되는가

| 항목 | 위치 | 수량 |
|------|------|------|
| 에이전트 정의 | `~/.claude/agents/*.md` | 69개 |
| 출력 스키마 | `~/.claude/agents/schemas/` | 1개 |
| 오케스트레이터 스킬 | `~/.claude/skills/orchestrator/` | 1개 |

### 무엇이 설치되지 않는가

**보안 훅**(`pre-security-gate.js` 등)은 프로젝트 로컬 전용이며 전역 설치에 포함되지 않습니다.
프로젝트별로 보안 훅이 필요하면 `.claude/hooks/`를 대상 프로젝트에 수동 복사하세요.

### 기존 에이전트와의 공존

`~/.claude/agents/`에 이미 있는 에이전트(architect, planner, code-reviewer 등)는 그대로 유지됩니다. 같은 이름의 파일만 백업 후 덮어쓰기됩니다. `./install.sh uninstall`로 원복할 수 있습니다.

---

## 관련 문서

| 문서 | 내용 |
|------|------|
| **[docs/system-guide.md](docs/system-guide.md)** | **시스템 종합 가이드 — 전체 구조, 에이전트 역할, 파이프라인 흐름, 보안 훅** |
| [catalog/taxonomy.md](catalog/taxonomy.md) | 카테고리별 에이전트 매핑 |
| [docs/global-installation-guide.md](docs/global-installation-guide.md) | 전역 설치 상세 옵션 |
| [docs/plans/](docs/plans/) | 설계 문서 |
| [docs/research/](docs/research/) | 서브에이전트 기술 연구 |
