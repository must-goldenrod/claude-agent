# Claude Code 서브에이전트 시스템 개요

## 핵심 개념

서브에이전트는 `Agent` 도구를 통해 호출되는 독립적인 Claude 인스턴스.
메인 대화 컨텍스트를 보호하면서 복잡한 작업을 병렬로 처리할 수 있음.

## 에이전트 정의 방식

### 1. 빌트인 에이전트
- `subagent_type` 파라미터로 지정 (general-purpose, Explore, Plan 등)
- 시스템에 하드코딩, 수정 불가
- 각 타입별로 접근 가능한 도구가 미리 정해져 있음

### 2. 커스텀 에이전트
- `.claude/agents/<name>.md` 파일로 정의
- 프로젝트별(`.claude/agents/`) 또는 글로벌(`~/.claude/agents/`)
- 플러그인의 `agents/` 디렉토리에도 정의 가능

## 에이전트 .md 파일 구조

```markdown
---
model: sonnet | opus | haiku    # 사용할 모델
color: blue | green | red ...   # UI 표시 색상 (선택)
---

# 에이전트 설명 (description으로 사용됨)

<example> 블록으로 트리거 조건 정의

## System Prompt 이하가 에이전트의 지시사항
```

## 주요 파라미터

| 파라미터 | 설명 |
|----------|------|
| `subagent_type` | 빌트인 타입 또는 커스텀 에이전트 이름 |
| `prompt` | 에이전트에게 전달할 작업 설명 |
| `model` | 모델 오버라이드 (sonnet/opus/haiku) |
| `isolation` | `worktree`로 격리 실행 가능 |
| `run_in_background` | 백그라운드 실행 |
| `resume` | 이전 에이전트 ID로 재개 |

## 연구 TODO

- [ ] 에이전트 간 통신 패턴 조사
- [ ] 에이전트 체이닝 (한 에이전트가 다른 에이전트 호출) 가능 여부
- [ ] 컨텍스트 윈도우 제한과 에이전트 성능 관계
- [ ] 모델 선택(sonnet vs opus vs haiku)이 에이전트 품질에 미치는 영향
- [ ] worktree 격리 모드 활용 패턴
