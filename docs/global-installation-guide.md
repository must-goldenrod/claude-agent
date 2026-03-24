# 전역 설치 및 사용 가이드

## 설정 계층 이해

```
~/.claude/                     ← 전역 (모든 프로젝트에 적용)
├── agents/     (기존 범용)
├── hooks/
├── skills/
└── settings.json

<project>/.claude/             ← 프로젝트 (해당 프로젝트만)
├── agents/     (69개 팀 에이전트)
├── hooks/      (보안 + 추적)
├── skills/     (orchestrator)
└── settings.json
```

**우선순위:** 같은 이름이면 프로젝트 레벨이 전역을 override.

---

## 설치 옵션

### 옵션 1: 독립 에이전트만 (최소 설치)

오케스트레이터 없이 개별적으로 사용 가능한 에이전트만 전역에 복사:

```bash
# 구현 에이전트
cp .claude/agents/{backend-developer,frontend-developer,code-architect}.md ~/.claude/agents/

# 보안 에이전트
cp .claude/agents/{security-auditor,secrets-scanner,dependency-scanner,api-security-auditor}.md ~/.claude/agents/

# DevOps 에이전트
cp .claude/agents/{pr-manager,release-manager,ci-cd-monitor}.md ~/.claude/agents/

# DB 에이전트
cp .claude/agents/{data-modeler,migration-writer}.md ~/.claude/agents/

# 문서 에이전트
cp .claude/agents/{api-doc-writer,guide-writer}.md ~/.claude/agents/

# 테스트 에이전트
cp .claude/agents/{unit-test-writer,integration-test-writer}.md ~/.claude/agents/

# 메타 에이전트
cp .claude/agents/harness-optimizer.md ~/.claude/agents/
```

PROACTIVE 트리거가 적용되어 있어 복사만 하면 자동 위임이 즉시 작동합니다.

> **주의:** 기존 전역 에이전트(`~/.claude/agents/`)와 이름 충돌하지 않는지 확인하세요.

### 옵션 2: 보안 훅 추가

모든 프로젝트에서 보호 파일/시크릿/위험 명령을 자동 차단:

```bash
# 보안 훅 복사 (standalone)
cp .claude/hooks/pre-security-gate.js ~/.claude/hooks/
```

`~/.claude/settings.json`에 훅 등록:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [{
          "type": "command",
          "command": "node ~/.claude/hooks/pre-security-gate.js"
        }]
      }
    ]
  }
}
```

> 기존 settings.json에 다른 설정이 있으면 `PreToolUse` 배열에 추가하세요.

### 옵션 3: 전체 파이프라인 (프로젝트별)

특정 프로젝트에서 오케스트레이터 전체를 사용하려면:

```bash
cd <target-project>

# 에이전트 + 스킬 + 훅 복사
cp -r <claude-agent>/.claude/agents/ .claude/agents/
cp -r <claude-agent>/.claude/skills/ .claude/skills/
cp -r <claude-agent>/.claude/hooks/ .claude/hooks/
cp <claude-agent>/.claude/settings.json .claude/settings.json

# 출력 스키마 복사
mkdir -p agents/schemas/
cp <claude-agent>/agents/schemas/output-format.md agents/schemas/

# .gitignore에 output/ 추가
echo "output/" >> .gitignore
```

---

## 사용법

### 자동 위임 (PROACTIVE 트리거)

에이전트를 설치하면 별도 호출 없이 상황에 맞게 자동 위임됩니다:

```
"이 코드의 보안 취약점을 검사해줘"
→ security-auditor 자동 위임

"PR을 만들어줘"
→ pr-manager 자동 위임

"API 문서를 생성해줘"
→ api-doc-writer 자동 위임

"사용자 테이블을 설계해줘"
→ data-modeler 자동 위임
```

### 오케스트레이터 파이프라인

전체 설치(옵션 3)된 프로젝트에서만 사용 가능:

```
/orchestrator "여행 예약 시스템의 결제 모듈 설계"
```

파이프라인 흐름: 조사팀(5명) → 토론팀(3라운드×6명) → 종합팀(7명) → 품질팀(Go/No-Go) → 보안팀(15명, 구현 단계만)

### 보안 훅

설치하면 자동 동작. 별도 조작 불필요:

```bash
# 운영 모드 전환
export HARNESS_HOOK_PROFILE=standard  # 경고만 (기본)
export HARNESS_HOOK_PROFILE=strict    # 실제 차단
export HARNESS_HOOK_PROFILE=minimal   # Bash만 검사
```

---

## 트러블슈팅

### 에이전트가 자동 위임되지 않을 때

1. description에 `Use PROACTIVELY when` 패턴이 있는지 확인
2. `NOT FOR:` 조건에 해당하는 상황이 아닌지 확인
3. 이름 충돌 확인: `ls ~/.claude/agents/ .claude/agents/ | sort | uniq -d`

### 보안 훅이 정상 작업을 차단할 때

```bash
export HARNESS_HOOK_PROFILE=standard  # warn 모드로 전환
# 또는
export HARNESS_HOOK_PROFILE=minimal   # 일시적 최소화
```
