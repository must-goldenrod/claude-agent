# 하네스 엔지니어링 구조 강화 — 개발 기획문서

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**문서 버전:** 3.0
**작성일:** 2026-03-24
**최종 수정:** 2026-03-24 (DROP 내용 제거, 불일치 수정, 문서 구조 정리)
**근거 문서:** `harness_strategy_report.pdf` (2026-03-23)
**목표:** 기존 68개 에이전트 시스템의 하네스 수준 구조 강화 — 유효한 패턴 선별 적용

> **변경 이력:**
> - v1.0: 기획 보고서 기반 10개 패턴 전체 구현 계획
> - v2.0: 6개 에이전트 다각도 검토 → 5개 DROP, 2개 재설계, 3개 유효 판정
> - v3.0: DROP 내용 제거, 기술적 불일치 수정, 실행 가능한 Task만 잔존. 제거된 패턴은 부록 A로 이동

---

## 1. 현재 상태 요약

| 항목 | 현황 |
|------|------|
| 에이전트 수 | 68개 (10팀 구조) |
| 오케스트레이터 | 파일 기반 오케스트레이션 (깊이=1 우회) |
| DB | SQLite 8 테이블 (executions, evaluations, profiles 등) |
| 훅 | 2개 (PreToolUse 타이밍, PostToolUse 실행 기록) — 관찰 전용 |
| 프로파일링 | 4축 복합 스코어 (Quality/Efficiency/Reliability/Impact) |
| 보안 | sanitize.js + 25개 보안 테스트 |

---

## 2. 실행 범위

원안 10개 패턴 중 기술 검증을 거쳐 **5개 Task만 실행**합니다.

| Task | 패턴 원안 | 판정 | 핵심 변경 |
|------|----------|------|----------|
| **1-1** | C. PROACTIVE 트리거 | **VIABLE** | 68개 에이전트 description 보강 |
| **1-2** | H. Haiku 모델 티어 | **VIABLE (축소)** | 12개 → **4개**만 전환 |
| **2-1** | E. 보안 훅 + B'. 경로 제한 | **VIABLE + REDESIGN** | 보안 훅 신규 구현 + 원안 B(Write 제거) 대체 |
| **2-2** | G'. 4축 프로파일 활성화 | **REDESIGN** | 7차원 신규 → 기존 4축 정기 운영으로 축소 |
| **2-3** | harness-optimizer | **VIABLE** | 4축 기반 메타 에이전트 (7차원 참조 제거) |

**일정:** 4주 → **2주**로 단축 (Phase 1: 1주, Phase 2: 1주)

---

## 3. Phase 1 — 기반 구축 (1주차)

> **원칙:** 코드 변경 없이 68개 에이전트의 메타데이터만 수정하여 즉각적 효과

### Task 1-1: PROACTIVE 트리거 디스크립션 (Pattern C)

**근거:** Claude Code 공식 문서 — *"To encourage proactive delegation, include phrases like 'use proactively' in your subagent's description field."* LLM이 description 텍스트를 파싱하여 자동 위임 결정.

**목표:** 68개 에이전트 description에 구조화된 트리거 패턴 적용

**패턴 형식:**
```
<기존 설명>. Use PROACTIVELY when <트리거 조건>. NOT FOR: <부정 조건>.
```

**에이전트별 트리거 설계 (대표 예시):**

| 에이전트 | PROACTIVE 트리거 | NOT FOR |
|---------|-----------------|---------|
| code-reviewer-impl | code has been written or modified and needs quality review before PR | writing code, architecture decisions, planning |
| security-lead | implementation is complete and needs security gate review before merge | code review for logic/style, performance optimization |
| backend-developer | task assignments include API endpoints, business logic, or server-side features | frontend components, CSS styling, database schema design |
| frontend-developer | task assignments include UI components, pages, or client-side interactions | API endpoints, database queries, DevOps configuration |
| unit-test-writer | new functions or modules have been implemented and need test coverage | integration tests, E2E tests, code implementation |
| fact-checker | research or debate outputs contain factual claims that need verification | code review, implementation tasks, opinion evaluation |
| threat-intel-monitor | project uses external dependencies or deploys to production infrastructure | code style review, feature planning, documentation |
| data-modeler | new feature requires database tables or schema modifications | API implementation, frontend work, testing |
| secrets-scanner | code changes include configuration files, .env patterns, or credential handling | code logic review, performance analysis |

**전체 68개 에이전트에 대해 동일 패턴 적용.** 핵심 에이전트(위 9개)부터 시작하여 점진적 확대.

**변경 범위:** `.claude/agents/*.md` 68개 파일의 `description` 필드
**검증:** 변경 후 독립 호출 시나리오에서 자동 위임 작동 확인

---

### Task 1-2: Haiku 모델 티어 추가 (Pattern H — 축소)

**근거:** 실증 분석 결과, 12개 후보 중 **4개만 Haiku 전환 안전**으로 판정.

**현재:** Opus 18개 + Sonnet 50개
**목표:** Opus 18개 + Sonnet 46개 + **Haiku 4개**

**전환 대상 (SAFE 판정):**

| 에이전트 | 전환 근거 |
|---------|----------|
| test-runner | 순수 기계적 작업: 테스트 실행 → 결과 파싱 → 6개 카테고리 분류 → JSON 보고 |
| containerizer | Docker Best Practice = 명확한 결정 트리. 판단 불필요 |
| guide-writer | 정보 추출 + 구조화된 글쓰기. 템플릿 명확 |
| fact-checker | 4가지 상태 분류(verified/unverified/false/outdated) + 검색 매칭 |

**제외된 후보와 근거:**

| 에이전트 | 제외 사유 |
|---------|----------|
| moderator | 18개 파일(3라운드 × 6토론자) 교차 분석 + 공정성 메타 판단 — UNSAFE |
| realist | "50:50 분배 금지" 규칙, 근거 기반 독립 가중치 판단 — UNSAFE |
| devils-advocate | 최강 논거의 논리적 결함 발견이 핵심 가치 — UNSAFE |
| optimist, pessimist, conservative | Round 2-3 전략적 반박, 포지션 유지 판단 — RISKY |
| bias-detector | bias vs. judgment call 미묘한 구분 — RISKY |
| data-modeler | 인덱스 전략 최적화, 비정규화 판단 — RISKY |

**변경 범위:** `.claude/agents/` 4개 파일의 `model` 필드를 `sonnet` → `haiku`로 변경
**롤백 조건:** 4축 프로파일 품질 점수 0.1 이상 하락 시 Sonnet으로 즉시 복원
**검증:** 오케스트레이터 파이프라인 1회 실행하여 출력 품질 비교

---

### Phase 1 산출물 체크리스트

- [ ] 68개 에이전트 description에 PROACTIVE + NOT FOR 패턴 적용
- [ ] 4개 에이전트 `model` 필드 haiku로 변경
- [ ] `catalog/taxonomy.md` 카테고리 매핑 문서 작성 (참고용, frontmatter 아님)
- [ ] 오케스트레이터 파이프라인 1회 검증 실행

---

## 4. Phase 2 — 하네스 레이어 (2주차)

> **원칙:** 보안 훅 인프라 구축 + 기존 프로파일 시스템 활성화

### Task 2-1: 보안 훅 파이프라인 (Pattern E + B' 통합)

**근거:**
- Pattern E: `permissionDecision: "deny"` 또는 exit code 2로 도구 호출 차단이 공식 지원됨
- Pattern B' (재설계): 원안(Write 도구 제거)은 파이프라인 파괴. 보안 훅으로 **허용 경로 외 쓰기 차단**으로 대체

**신규 훅 구조:**

```
.claude/hooks/
├── pre-agent-timing.js          (기존 — 관찰)
├── pre-security-gate.js         (신규 — 보안, 동기)
└── track-agent-execution.js     (기존 — 관찰)
```

**pre-security-gate.js — 검사 항목:**

| 검사 | 대상 도구 | 동작 |
|------|----------|------|
| 보호 파일 수정 차단 | Write, Edit | `.claude/settings.json`, `CLAUDE.md` 등 수정 시 차단 |
| 시크릿 패턴 차단 | Write, Edit | `API_KEY=`, `password=`, `token=` 등 내용 포함 시 차단 |
| 위험 명령 차단 | Bash | `rm -rf`, `git push --force`, `DROP TABLE` 등 차단 |
| 프로젝트 외부 경로 차단 | Write, Edit | 프로젝트 디렉토리 밖 쓰기 차단 |

**차단 메커니즘 (Claude Code 공식 API):**
```js
// 차단 시: exit code 2로 종료
// 또는 stdout으로 JSON 출력:
// { "permissionDecision": "deny", "reason": "Protected file modification blocked" }

// 허용 시: exit code 0, 출력 없음
```

**settings.json 변경:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/pre-security-gate.js"
        }]
      },
      {
        "matcher": "Agent",
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/pre-agent-timing.js"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [{
          "type": "command",
          "command": "node .claude/hooks/track-agent-execution.js"
        }]
      }
    ]
  }
}
```

**운영 모드 (환경변수):**
- `HARNESS_HOOK_PROFILE=minimal` — 보안 훅만 활성화
- `HARNESS_HOOK_PROFILE=standard` — 보안 + 관찰 (기본값)
- `HARNESS_HOOK_PROFILE=strict` — 보안 강화 + 전수 로깅

**warn 모드 우선 전략:** 처음 1주는 차단 대신 stderr 경고만 출력. 오탐(false positive)이 없음을 확인 후 block 모드로 전환.

**알려진 제약 — 에이전트별 경로 제한:**
서브에이전트는 독립 프로세스로 실행되므로, PreToolUse 훅 입력에 **호출한 에이전트 식별 정보가 포함되지 않음**. 따라서 에이전트별 차등 경로 제한(토론팀은 `output/debate/`만 등)은 현재 메커니즘으로 구현 불가. 대안:
1. **프로젝트 레벨 공통 규칙** — 모든 에이전트에 동일한 보호 파일/경로 규칙 적용 (권장)
2. **에이전트 frontmatter `hooks` 필드** — 개별 에이전트에 전용 훅 지정 (복잡도 높음, 추후 검토)

**구현 파일:**
- `marketplace/src/security-gate.js` — 보안 검사 로직 (경로 검증, 시크릿 패턴, 위험 명령)
- `.claude/hooks/pre-security-gate.js` — 훅 진입점 (stdin 파싱 → security-gate 호출 → exit code)
- `marketplace/tests/security-gate.test.js` — 테스트 (보호 파일, 시크릿, 위험 명령, 정상 경로)

---

### Task 2-2: 4축 프로파일 정기 운영 체계 (Pattern G' — 축소)

**근거:** 7차원 감사 스코어 중 3개 차원(컨텍스트 효율, 메모리 지속, 비용 효율)이 자기순환적 — "구현 여부"를 측정할 뿐 실제 품질 미측정. 기존 4축(Quality/Efficiency/Reliability/Impact)이 이미 구현되어 있으나 비활성 상태. 신규 구축 대신 활성화에 집중.

**목표:** 기존 4축 프로파일의 정기 실행 주기 구성 + 트렌드 추적

**구현 항목:**

| 항목 | 내용 |
|------|------|
| 정기 실행 | `profile refresh` 주 1회 자동 실행 (cron 또는 SessionStart 훅) |
| 트렌드 추적 | `profile_history` 테이블에 주간 스냅샷 누적 (이미 존재) |
| 임계값 알림 | composite 0.5 미만 에이전트 stderr 경고 출력 |
| memory 필드 추가 | 핵심 에이전트 5개(research-lead, synthesis-lead, quality-lead, security-lead, code-lead)에 `memory: project` 추가 → `.claude/agent-memory/` 통한 크로스세션 학습 |

**변경 파일:**
- `.claude/agents/` 5개 파일 — `memory: project` 필드 추가
- `marketplace/src/profiler.js` — 임계값 경고 로직 추가
- `.claude/hooks/` 또는 cron — 주간 실행 트리거

---

### Task 2-3: harness-optimizer 메타 에이전트

**목표:** 4축 프로파일 기반으로 개선안을 자동 생성하는 69번째 에이전트

**기능:**
1. 4축 프로파일 데이터 수집 (`profile team` 출력 분석)
2. composite 하위 10% 에이전트 식별
3. 각 에이전트의 약점 축 분석 + 구체적 개선안 생성
4. 이전 프로파일 스냅샷과 비교하여 트렌드 보고

**에이전트 정의:**

```yaml
---
name: harness-optimizer
description: >
  Analyzes 4-axis agent profile scores (Quality/Efficiency/Reliability/Impact)
  and generates improvement recommendations. Use PROACTIVELY when composite
  scores drop below 0.6 or after completing a pipeline milestone.
  NOT FOR: code implementation, security review, direct code modification.
tools: Read, Grep, Glob, Bash
model: sonnet
color: yellow
---
```

**구현 파일:**
- `.claude/agents/harness-optimizer.md` — 에이전트 정의 (69번째)
- 출력: `output/harness-optimization-{date}.json`

---

### Phase 2 산출물 체크리스트

- [ ] `pre-security-gate.js` 보안 훅 구현 + 테스트 (warn 모드 우선)
- [ ] `security-gate.js` 보안 검사 로직
- [ ] `settings.json` PreToolUse 훅 등록 (`Write|Edit|Bash` 매처)
- [ ] `HARNESS_HOOK_PROFILE` 환경변수 프로파일 전환
- [ ] 핵심 5개 에이전트에 `memory: project` 필드 추가
- [ ] 4축 프로파일 정기 실행 주기 구성
- [ ] `harness-optimizer.md` 메타 에이전트 정의
- [ ] 전체 파이프라인 통합 테스트

---

## 5. 위험 관리

| 위험 | 영향 | 확률 | 대응 |
|------|------|------|------|
| Haiku 전환 후 출력 품질 저하 | 중 | 낮 | 4개로 축소하여 위험 감소. 4축 프로파일 모니터링, 0.1 하락 시 롤백 |
| 보안 훅 false positive (정상 작업 차단) | 중 | 중 | **warn 모드로 1주 운영** 후 block 전환. 화이트리스트 패턴 |
| 보안 훅 레이턴시 누적 | 중 | 중 | 동기 훅이 Write/Edit/Bash 매 호출마다 Node.js 프로세스 스폰(50~200ms). 경량 판단 로직 + 캐싱 적용 |
| PROACTIVE 트리거 68개 일괄 작성 시 복사-붙여넣기 품질 | 낮 | 중 | 핵심 에이전트 9개부터 시작, 점진적 확대 |

---

## 6. 성공 지표

| 지표 | 현재 | Phase 1 목표 | Phase 2 목표 |
|------|------|-------------|-------------|
| PROACTIVE 트리거 적용률 | ~7% (5/68) | 100% (68/68) | 100% |
| 모델 티어 (Opus/Sonnet/Haiku) | 18/50/0 | 18/46/4 | 18/46/4 |
| 보안 훅 구현 | 없음 | - | warn 모드 운영 중 |
| 4축 프로파일 정기 실행 | 비활성 | - | 주 1회 자동 |
| `memory: project` 적용 에이전트 | 0 | - | 5개 |
| harness-optimizer 에이전트 | 없음 | - | 구현 완료 |

---

## 7. 일정 요약

```
Week 1 (Phase 1 — 기반 구축)
├── Day 1-2: Task 1-1 PROACTIVE 트리거 (핵심 9개 → 전체 68개)
├── Day 3:   Task 1-2 Haiku 전환 (4개: test-runner, containerizer, guide-writer, fact-checker)
├── Day 4:   catalog/taxonomy.md 문서 작성
├── Day 5:   오케스트레이터 파이프라인 검증 실행

Week 2 (Phase 2 — 하네스 레이어)
├── Day 1-3: Task 2-1 보안 훅 파이프라인 (warn 모드) + 테스트
├── Day 4:   Task 2-2 4축 프로파일 정기 실행 + memory: project 필드 추가
├── Day 5:   Task 2-3 harness-optimizer 메타 에이전트 + 통합 테스트
```

---

## 8. 파일 변경 매트릭스

| Phase | 신규 파일 | 수정 파일 | 테스트 파일 |
|-------|----------|----------|-----------|
| Phase 1 | `catalog/taxonomy.md` | 68개 에이전트 `.md` (description 보강 + 4개 model 변경) | - |
| Phase 2 | `pre-security-gate.js`, `security-gate.js`, `harness-optimizer.md` | `settings.json`, 5개 에이전트 `.md` (memory 추가), `profiler.js` | `security-gate.test.js` |

---

## 부록 A: 제거된 패턴과 사유

v1.0에서 계획했으나 기술 검증 후 DROP/재설계된 패턴입니다. 향후 전제 조건이 변경되면 재검토할 수 있습니다.

### A. 택소노미 네임스페이싱 — DROP

| 항목 | 내용 |
|------|------|
| **원안** | frontmatter에 `category: review` 등 추가, 디렉토리 `review/`, `build/` 등으로 재구성 |
| **제거 사유** | `category`는 Claude Code 공식 지원 14개 frontmatter 필드에 포함되지 않음. 추가해도 런타임에서 무시. 오케스트레이터가 에이전트를 명시적 지명하므로 라우팅 오분류 문제 자체 없음 |
| **대안 채택** | `catalog/taxonomy.md` 참고 문서만 작성 (Phase 1 산출물에 포함) |
| **재검토 조건** | Claude Code가 `category` 필드를 공식 지원하게 되는 경우 |

### B. 권한 이분화 (Read-Only 전환) — REDESIGN → B'

| 항목 | 내용 |
|------|------|
| **원안** | 16개 에이전트(토론/종합/품질)의 `tools`에서 Write 제거, Read-Only로 전환 |
| **제거 사유** | **파이프라인 파괴.** 오케스트레이터는 에이전트 출력을 수집하지 않음. 데이터 흐름 100%가 파일 시스템 경유. 16개 에이전트 전원이 `output/{phase}/` 경로에 JSON Write 필수. fact-checker 등 프롬프트에 "All output must be valid JSON written via the Write tool" 명시. Write 제거 = 파이프라인 즉시 중단 |
| **대안 채택** | Task 2-1 보안 훅으로 허용 경로 외 쓰기 차단 (Write 도구 자체는 유지) |
| **재검토 조건** | 오케스트레이터가 에이전트 출력을 직접 수집하는 구조로 변경되는 경우 |

### D. Progressive Disclosure — DROP

| 항목 | 내용 |
|------|------|
| **원안** | 에이전트 정의를 L1(name+desc 100토큰)/L2(전체 SKILL.md)/L3(scripts)로 분리. 68개 × 800토큰 = 54,400토큰을 6,800으로 87% 절감 |
| **제거 사유** | **전제 무효.** 서브에이전트 시스템 프롬프트는 해당 에이전트 실행 시 독립 컨텍스트에만 주입됨. 68개 에이전트 본문(~110,000토큰)은 메인 컨텍스트에 로드되지 않음. 공식 문서: *"Each subagent runs in its own context window"*. 54,400토큰 오버헤드 자체가 존재하지 않으므로 "87% 절감"은 허구 |
| **재검토 조건** | 없음 (전제 자체가 무효) |

### F. Decisions 테이블 — DROP

| 항목 | 내용 |
|------|------|
| **원안** | SQLite에 `decisions`, `skill_runs` 테이블 추가. 에이전트 판단 기록(선택, 대안, 근거, 결과)을 영속화 |
| **제거 사유** | **소비자 없음.** 에이전트가 DB에 직접 기록할 방법이 없음 (SQLite 접근 = Bash + node 스크립트 실행 필요). 간접 경로(PostToolUse 훅 → JSON 파싱)는 tracker.js 확장 + 스키마 + 출력 포맷 표준화의 3단계 작업 필요. 기존 executions/profiles 테이블조차 행동 변경에 활용된 이력 없음 |
| **대안 채택** | `memory: project` 필드로 크로스세션 학습 기반 구축 (Task 2-2) |
| **재검토 조건** | 기존 4축 프로파일 데이터가 실제 운영 의사결정에 활용되기 시작한 후 |

### G. 7차원 감사 스코어링 — REDESIGN → G'

| 항목 | 내용 |
|------|------|
| **원안** | 7차원 × 10점 = 70점 만점 체계. 도구 커버리지, 컨텍스트 효율, 품질 게이트, 메모리 지속, 평가 커버리지, 보안 가드레일, 비용 효율 |
| **축소 사유** | 7차원 중 3개(컨텍스트 효율, 메모리 지속, 비용 효율)가 자기순환적 — "해당 기능을 구현했냐/안 했냐"를 측정할 뿐 실제 품질 미반영. 기존 4축도 비활성 상태인데 차원만 늘리면 스코어 신뢰도 하락 |
| **대안 채택** | 기존 4축 프로파일 정기 운영 체계 구축 (Task 2-2) |
| **재검토 조건** | 4축 프로파일이 주 1회 이상 정기 실행되고 3개월 이상 데이터 축적된 후 |

### I. Instinct 시스템 — DROP

| 항목 | 내용 |
|------|------|
| **원안** | 세션 히스토리에서 반복 패턴 자동 추출 → YAML(trigger + confidence + action)로 등록. confidence > 0.7 자동, 0.5-0.7 사용자 확인, < 0.5 폐기 |
| **제거 사유** | **콜드 스타트 문제.** executions 테이블의 `prompt_hash`/`output_hash`는 내용 없이 해시만 존재하여 패턴 추출 불가. confidence 0.7 임계값이 통계적으로 의미있으려면 수백 회 실행 데이터 필요. 현재 0건. 지금 구현하면 실행할 수 없는 빈 껍데기 |
| **대안 채택** | `memory: project` 필드로 즉시 사용 가능한 크로스세션 학습 (Task 2-2) |
| **재검토 조건** | executions 500건 이상 축적 + 프롬프트/출력 내용 저장 체계 확보 후 |

### J. 설치 프로파일 — DROP

| 항목 | 내용 |
|------|------|
| **원안** | core(15개)/developer(40개)/full(68개) 3단계 프로파일 + manifest.json |
| **제거 사유** | Claude Code는 `.claude/agents/` 전체를 로드하며 **선택적 로딩 메커니즘 없음**. `permissions.deny`로 개별 비활성화는 가능하나 프로파일 관리 목적으로 부적합. 단일 개발자 프로젝트에서 3단계 프로파일은 과도한 추상화. 전략 보고서 자체도 "팀 규모가 작을 경우 매니페스트 관리 자체가 오버헤드"라고 명시 |
| **재검토 조건** | 팀 규모 3명 이상으로 확대되는 시점 |

### v1.0 "35% 달성도" 지표 — 폐기

| 항목 | 내용 |
|------|------|
| **원안** | 10개 패턴 대비 현재 구현 상태를 패턴별 %로 산출, 가중 평균 35% |
| **폐기 사유** | 존재하지 않는 측정 도구(7차원 감사)로 산출한 수치. 패턴별 % 산출 근거 부재. 10개 패턴 중 5개가 DROP된 시점에서 분모 자체가 변경됨. 측정 방법론 정의 전에 수치를 제시하는 것은 역순 |

---

## 부록 B: 검토에 참여한 에이전트

| 라운드 | 에이전트 | 역할 | 주요 발견 |
|--------|---------|------|----------|
| 1차 | tech-researcher | 기술적 타당성 | `category` 미지원, `memory: project` 대안 발견 |
| 1차 | realist | 현실 점검 | Pattern B 파이프라인 파괴 경고, 콜드 스타트 문제 지적 |
| 1차 | devils-advocate | 가정 공격 | 35% 지표 허구, 7차원 자기순환, Haiku 역할 오독 |
| 2차 | code-explorer #1 | Write 도구 검증 | 16개 에이전트 전원 Write 필수 실증 |
| 2차 | code-explorer #2 | 토큰 로딩 검증 | 서브에이전트 독립 컨텍스트 공식 문서 확인, 87% 절감 전제 무효 |
| 2차 | code-explorer #3 | Haiku 적합성 | SAFE 4개, RISKY 4개, UNSAFE 4개 판정 |

---

## 부록 C: 기획서 패턴 → 최종 매핑

| 기획서 패턴 | 최종 판정 | Task | Phase |
|------------|----------|------|-------|
| A. 택소노미 | DROP | - | - |
| B. 권한 이분화 | REDESIGN → B' | 2-1 (보안 훅 통합) | 2 |
| C. PROACTIVE 트리거 | **VIABLE** | 1-1 | 1 |
| D. Progressive Disclosure | DROP | - | - |
| E. 보안 훅 파이프라인 | **VIABLE** | 2-1 | 2 |
| F. Decisions 테이블 | DROP | - | - |
| G. 7차원 감사 스코어링 | REDESIGN → G' | 2-2 | 2 |
| H. Haiku 모델 티어 | **VIABLE (축소)** | 1-2 | 1 |
| I. Instinct 시스템 | DROP | - | - |
| J. 설치 프로파일 | DROP | - | - |
