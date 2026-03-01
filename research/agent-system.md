# Claude Code 서브에이전트 시스템 심층 연구

> 마지막 업데이트: 2026-03-01
> 출처: 공식 문서, plugin-dev 레퍼런스, GitHub 이슈, 커뮤니티 자료

---

## 1. 아키텍처 개요

서브에이전트는 `Agent` 도구를 통해 호출되는 **독립적인 Claude 인스턴스**.
메인 대화 컨텍스트를 보호하면서 복잡한 작업을 병렬로 처리할 수 있음.

```
┌─────────────────────────────────────────────┐
│  메인 대화 (Parent)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  │
│  │ (독립 CW)│  │ (독립 CW)│  │ (독립 CW)│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │결과반환       │결과반환      │결과반환  │
│       └──────────────┴─────────────┘        │
└─────────────────────────────────────────────┘
```

핵심 제약: **서브에이전트는 다른 서브에이전트를 호출할 수 없음** (깊이 = 항상 1)

---

## 2. 에이전트 발견 및 등록

### 2.1 발견 위치 (우선순위 순)

| 우선순위 | 위치 | 범위 | 생성 방법 |
|---------|------|------|----------|
| 1 (최고) | `--agents` CLI 플래그 | 현재 세션만 | JSON 인라인 정의 |
| 2 | `.claude/agents/*.md` | 현재 프로젝트 | `/agents` 또는 수동 생성 |
| 3 | `~/.claude/agents/*.md` | 전역 (모든 프로젝트) | `/agents` 또는 수동 생성 |
| 4 (최저) | 플러그인 `agents/` 디렉토리 | 플러그인 활성 범위 | 플러그인 설치 |

동일 이름 충돌 시 **높은 우선순위가 승리**. 플러그인 간 동일 이름은 에러 발생.

### 2.2 에이전트가 시스템에 노출되는 방식

에이전트들은 **Agent 도구의 description**에 리스트로 포함됨.
Claude는 이 설명을 읽고 어떤 에이전트를 호출할지 판단.

**로딩 시점**: 세션 시작 시 1회. 세션 중 파일 추가 시 `/agents`로 리로드 필요.

### 2.3 플러그인 에이전트 통합

```
~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin-name>/agents/<agent>.md
```

- `plugin.json`에 `agents` 필드 명시 가능 (없으면 `./agents/` 자동 탐색)
- `plugin.json`의 description은 플러그인 전체 설명 (마켓플레이스용)
- 개별 에이전트 `.md`의 description이 Claude의 위임 판단에 사용됨

---

## 3. 에이전트 파일 포맷

### 3.1 프론트매터 (YAML)

```yaml
---
# 필수 아님 - description은 마크다운 본문에서 추출
model: sonnet | opus | haiku | inherit  # 기본값: inherit
color: blue | green | yellow | red | cyan | magenta | pink  # UI 색상
tools: Read, Grep, Glob, Bash          # 허용 도구 (생략 시 전체 상속)
disallowedTools: Write, Edit            # 거부 도구
maxTurns: 20                            # 최대 턴 수
permissionMode: default | acceptEdits | dontAsk | bypassPermissions | plan
skills: [skill-name]                    # 프리로드할 스킬
mcpServers: [server-name]              # MCP 서버
hooks: {}                               # 에이전트 스코프 훅
memory: user | project | local          # 영속 메모리
background: true                        # 항상 백그라운드 실행
isolation: worktree                     # Git worktree 격리
---
```

### 3.2 마크다운 본문 구조

```markdown
# 에이전트 설명 (description)

트리거 조건을 포함한 설명. Claude가 이 텍스트를 보고 위임 결정.

<example>
Context: 이 에이전트를 호출해야 하는 상황
user: "사용자 메시지 예시"
assistant: "에이전트를 사용하겠습니다"
<commentary>왜 이 에이전트가 트리거되어야 하는지</commentary>
</example>

## System Prompt (이하 전체가 에이전트의 시스템 프롬프트)

에이전트의 지시사항, 규칙, 출력 형식 등...
```

**핵심**: `---` 아래의 마크다운 전체가 에이전트의 시스템 프롬프트가 됨.

### 3.3 color 컨벤션

| 색상 | 권장 용도 |
|------|----------|
| blue/cyan | 분석, 리뷰 |
| green | 생성, 구축 |
| yellow | 검증, 주의 |
| red | 보안, 중요 |
| magenta/pink | 변환, 창의적 |

순전히 시각적 구분. 동작에 영향 없음.

---

## 4. 호출 메커니즘

### 4.1 컨텍스트 전달

서브에이전트는 **부모 대화 히스토리를 받지 않음**. 받는 것:

| 항목 | 설명 |
|------|------|
| 시스템 프롬프트 | .md 파일의 마크다운 본문 |
| 환경 정보 | 작업 디렉토리 등 기본 정보 |
| 작업 프롬프트 | Agent 도구의 `prompt` 파라미터 → 에이전트의 첫 "사용자 메시지" |
| 스킬 (선택) | `skills` 필드에 지정된 스킬 전체 내용 주입 |
| 메모리 (선택) | `memory` 활성 시 MEMORY.md 첫 200줄 |

**예외 — resume**: 에이전트 ID로 재개 시 **전체 대화 기록이 복원됨**.

### 4.2 도구 접근 제어

두 가지 메커니즘:
- **`tools` (허용 목록)**: 지정된 도구만 사용 가능. 생략 시 전체 상속.
- **`disallowedTools` (거부 목록)**: 상속된 도구에서 제거.

제한된 도구는 에이전트의 프롬프트에 **아예 표시되지 않음** (런타임 차단이 아닌 프롬프트 레벨 제거).

### 4.3 모델 선택 로직

| 설정 | 결과 |
|------|------|
| `model: sonnet` | Sonnet 사용 |
| `model: opus` | Opus 사용 |
| `model: haiku` | Haiku 사용 |
| `model: inherit` 또는 생략 | 부모 세션과 동일 모델 |
| Agent 도구 `model` 파라미터 | 호출 시 오버라이드 가능 |
| `CLAUDE_CODE_SUBAGENT_MODEL` 환경변수 | 전역 오버라이드 |

### 4.4 결과 반환

```
{
  result: string           // 에이전트의 최종 텍스트 응답
  usage?: { input_tokens, output_tokens }
  total_cost_usd?: number
  duration_ms?: number
  agentId: string          // resume용 UUID
}
```

- 에이전트 결과만 부모 컨텍스트에 들어감 (전체 작업 히스토리는 아님)
- 반환 크기에 문서화된 제한 없음 (부모 컨텍스트 소비가 실질적 제한)

### 4.5 max_turns

- 에이전트의 최대 API 호출 횟수 제한
- 기본값: 문서상 명시 안 됨 (실질적으로 컨텍스트 한도까지)
- 도달 시: 누적된 결과를 반환하고 종료 (정확한 동작 미확인)

---

## 5. 실행 패턴

### 5.1 포그라운드 vs 백그라운드

| | 포그라운드 | 백그라운드 |
|---|----------|----------|
| 차단 | 메인 대화 차단 | 비차단, 병행 작업 가능 |
| 권한 | 대화형 프롬프트 | 사전 승인, 미승인은 자동 거부 |
| 질문 | AskUserQuestion 통과 | AskUserQuestion 실패 (에이전트는 계속) |
| 완료 알림 | 즉시 결과 반환 | 알림 주입 (비동기) |
| 전환 | Ctrl+B로 백그라운드 전환 가능 | - |

**알려진 이슈**:
- 다수 백그라운드 에이전트 동시 완료 시 알림 누락 가능 ([#20754](https://github.com/anthropics/claude-code/issues/20754))
- TaskOutput이 완료 후에도 "Booping..." 상태로 멈출 수 있음 ([#20236](https://github.com/anthropics/claude-code/issues/20236))
- 백그라운드 에이전트 출력이 조용히 손실될 수 있음 ([#17011](https://github.com/anthropics/claude-code/issues/17011))

### 5.2 병렬 실행

- 동시 실행 에이전트 수에 **공식 하드 리밋 없음**
- 실질적 제한: I/O, CPU, 메모리 (20+ 에이전트 시 시스템 불안정 보고)
- Claude Code 제작자(Boris Cherny)는 10-20개 병렬 에이전트 사용
- Anthropic 자체 테스트: C 컴파일러 빌드에 16개 에이전트, 100,000줄 Rust 코드 생성
- **병렬 에이전트 간 직접 통신 불가** (각자 독립 결과 반환)

### 5.3 에이전트 재개 (Resume)

- 완료 시 반환되는 `agentId`로 재개 가능
- 재개 시 **전체 대화 트랜스크립트 복원** (도구 호출, 결과, 추론 포함)
- 트랜스크립트 저장: `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`
- 기본 30일 후 자동 정리 (`cleanupPeriodDays`)
- 부모 대화 압축이 서브에이전트 트랜스크립트에 영향 없음

### 5.4 Worktree 격리

```
<repo>/.claude/worktrees/<name>/   ← 격리된 작업 디렉토리
worktree-<name>                    ← 자동 생성 브랜치
```

- 기본 리모트 브랜치에서 분기
- **변경 없으면**: 자동 정리 (worktree + 브랜치 삭제)
- **변경 있으면**: 유지/삭제 선택 프롬프트
- `.claude/worktrees/`를 `.gitignore`에 추가 권장
- 결과 통합은 수동 merge/cherry-pick 필요

### 5.5 에이전트 체이닝

**서브에이전트는 다른 서브에이전트를 호출할 수 없음** (핵심 아키텍처 제약)

- Agent 도구가 서브에이전트의 도구 목록에서 제외됨
- 체이닝이 필요하면 **메인 대화에서 순차 호출**

```
메인 대화 → Agent A (완료) → 결과를 바탕으로 → Agent B (완료) → ...
```

- `claude -p`로 Bash 내 CLI 서브프로세스 실행은 기술적으로 가능하나 비공식/비권장

---

## 6. 컨텍스트 윈도우 관리

| 항목 | 값 |
|------|------|
| 윈도우 크기 | 200,000 토큰 |
| 자동 압축 임계값 | ~95% (약 190K 토큰) |
| 압축 결과 | 70K 토큰 → ~4K 토큰 요약 |
| 환경변수 오버라이드 | `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` |

- 각 서브에이전트가 **독립된 컨텍스트 윈도우** 보유
- 서브에이전트도 동일한 자동 압축 로직 적용
- 결과만 부모에게 반환 → 부모 컨텍스트 절약이 서브에이전트의 핵심 이점

---

## 7. Agent Teams (실험적)

서브에이전트와 별개의 **실험적 기능** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).

| 서브에이전트 | Agent Teams |
|------------|-------------|
| 같은 프로세스 | 별도 Claude Code 인스턴스 |
| 결과만 반환 | 공유 태스크 리스트 + 메일박스 메시징 |
| 직접 통신 불가 | 팀원 간 직접 통신 가능 |
| 제한 없음 | 권장 3-5명 |
| 안정 | 실험적 |

---

## 8. 미확인/추가 연구 필요 사항

| 주제 | 현황 |
|------|------|
| CLAUDE.md가 서브에이전트에 자동 주입되는지 | 문서에 명시적 확인 없음 |
| 프론트매터 model과 Agent 도구 model 파라미터 충돌 시 우선순위 | 미확인 |
| maxTurns 기본값 | 문서에 없음 (무제한으로 추정) |
| maxTurns 도달 시 정확한 동작 | 미확인 (결과 반환 후 종료 추정) |
| "턴"의 정확한 정의 | 1 API 호출 = 1턴으로 추정 |
| 세션 종료 시 백그라운드 에이전트 동작 | 부모 프로세스와 함께 종료 추정 |
| 플러그인 간 동일 에이전트 이름 해결 방식 | 에러 또는 정규화 이름(`plugin:agent`) 사용 추정 |

---

## 참고 자료

### 공식 문서
- [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Agent teams](https://code.claude.com/docs/en/agent-teams)
- [Common workflows](https://code.claude.com/docs/en/common-workflows)

### GitHub 이슈
- [#4182](https://github.com/anthropics/claude-code/issues/4182) - 서브에이전트에서 Agent 도구 미노출
- [#15487](https://github.com/anthropics/claude-code/issues/15487) - maxParallelAgents 설정 요청
- [#20754](https://github.com/anthropics/claude-code/issues/20754) - 백그라운드 알림 누락
- [#5587](https://github.com/anthropics/claude-code/issues/5587) - 커스텀 프로젝트별 에이전트

### 로컬 레퍼런스
- `~/.claude/plugins/.../plugin-dev/skills/agent-development/` — 에이전트 생성 가이드
- `~/.claude/plugins/.../plugin-dev/skills/plugin-structure/` — 플러그인 구조 레퍼런스

### 커뮤니티
- [Building a C compiler with parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) — Anthropic 엔지니어링 블로그
- [ClaudeLog - Custom Agents](https://claudelog.com/mechanics/custom-agents/)
