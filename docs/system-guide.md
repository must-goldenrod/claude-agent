# Claude Agent Harness — 시스템 종합 가이드

> 이 문서는 69개 에이전트 시스템의 **전체 구조, 각 에이전트의 역할, 동작 원리, 문제 해결 방식**을 설명합니다.
> 프로젝트에 참여하는 모든 사람이 시스템을 이해할 수 있도록 작성되었습니다.

---

## 1. 핵심 개념

### 1.1 왜 멀티에이전트인가

하나의 AI에게 "결제 모듈을 설계해줘"라고 하면 단일 관점의 답변이 나옵니다. 이 시스템은 그 대신 **69개의 전문가가 각자의 역할로 협업**하여 다각도 분석을 수행합니다:

- 조사팀이 시장/기술/경쟁사를 **병렬로** 조사
- 토론팀이 찬성/반대/현실주의 관점에서 **3라운드 구조화 토론**
- 종합팀이 전략/리스크/실행계획으로 **통합**
- 품질팀이 사실검증/논리검증/편향검출로 **검증**
- 보안팀이 15개 보안 영역을 **병렬 감사**

### 1.2 깊이=1 제약과 파일 기반 오케스트레이션

Claude Code 서브에이전트의 핵심 제약: **서브에이전트는 다른 서브에이전트를 호출할 수 없습니다** (깊이=1).

즉, 팀 리더가 팀원을 직접 호출하는 것이 불가능합니다. 이를 우회하기 위해 **파일 시스템을 통신 채널로** 사용합니다:

```
메인 세션 (사용자와 대화)
  │
  ├─ [호출] 팀 리더 → output/{phase}/{team}/task-assignments.json 작성
  │
  ├─ [호출] 팀원 A ─→ task-assignments.json 읽기 → member-a.json 작성
  ├─ [호출] 팀원 B ─→ task-assignments.json 읽기 → member-b.json 작성  (병렬)
  ├─ [호출] 팀원 C ─→ task-assignments.json 읽기 → member-c.json 작성
  │
  └─ [호출] 팀 리더 (resume) → member-*.json 읽기 → team-report.json 작성
```

**모든 에이전트가 독립 프로세스**이고, **파일만이 유일한 통신 수단**입니다.

### 1.3 팀 리더의 2가지 모드

모든 팀 리더는 동일한 패턴으로 동작합니다:

| 모드 | 호출 시점 | 하는 일 | 출력 |
|------|----------|--------|------|
| **TASK ASSIGNMENT** | 팀 시작 시 | 프로젝트 분석 → 팀원별 작업 지시서 작성 | `task-assignments.json` |
| **RESUME / SYNTHESIS** | 팀원 완료 후 | 팀원 결과 전체 읽기 → 교차 분석 → 통합 보고서 | `team-report.json` |

이 2단계 사이에 메인 세션이 팀원들을 **병렬로** 호출합니다.

### 1.4 PROACTIVE 트리거

모든 69개 에이전트의 description에 자동 위임 패턴이 적용되어 있습니다:

```
Use PROACTIVELY when <이 에이전트가 필요한 상황>.
NOT FOR: <이 에이전트가 부적합한 상황>.
```

Claude Code는 description을 읽고 상황에 맞는 에이전트를 **자동으로 선택**합니다. 오케스트레이터 없이 독립적으로 사용할 때 특히 유용합니다.

### 1.5 모델 라우팅

에이전트의 역할 복잡도에 따라 3단계 모델이 할당됩니다:

| 모델 | 역할 | 해당 에이전트 |
|------|------|-------------|
| **Opus** | 복잡 추론, 교차 분석, 판단 | 팀 리더 18개 (research-lead, security-lead 등) |
| **Sonnet** | 전문 작업 수행 | 팀원 47개 (backend-developer, optimist 등) |
| **Haiku** | 단순 실행/보고 | 4개 (test-runner, containerizer, guide-writer, fact-checker) |

---

## 2. 오케스트레이터 파이프라인

### 2.1 전체 흐름

`/orchestrator "프로젝트 설명"` 명령으로 실행됩니다.

5개 SDLC 단계마다 동일한 파이프라인이 반복됩니다:
- `idea-exploration` → `requirements` → `architecture` → `implementation` → `testing`

각 단계의 흐름:

```
Step 0: 디렉토리 생성
         output/{phase}/research/
         output/{phase}/debate/round-1/ round-2/ round-3/
         output/{phase}/synthesis/
         output/{phase}/quality/
         output/{phase}/security/  (implementation/testing만)

Step 1: 조사팀 ────────────────────────────────────────────
         research-lead [TASK ASSIGNMENT]
           → task-assignments.json
         5명 병렬 실행 (web-researcher, market-analyst, tech-researcher,
                        trend-analyst, competitor-analyst)
           → member-*.json (5개)
         research-lead [RESUME]
           → team-report.json

Step 2: 토론팀 ────────────────────────────────────────────
         debate-lead [SETUP]
           → task-assignments.json (토론 주제 + 규칙)
         Round 1: 6명 병렬 (opening)
           → round-1/member-*.json (6개)
         Round 2: 6명 병렬 (cross-exam, Round 1 결과 참조)
           → round-2/member-*.json (6개)
         Round 3: 6명 병렬 (rebuttal, Round 1+2 결과 참조)
           → round-3/member-*.json (6개)
         moderator (18개 파일 전체 분석)
           → debate-summary.json
         debate-lead [RESUME]
           → team-report.json

Step 3: 종합팀 ────────────────────────────────────────────
         synthesis-lead [ASSIGNMENT]
           → task-assignments.json
         7명 병렬 (integrator, strategist, report-writer,
                   execution-planner, risk-manager, metrics-designer,
                   change-manager)
           → member-*.json (7개)
         synthesis-lead [INTEGRATION]
           → team-report.json

Step 4: 품질팀 ────────────────────────────────────────────
         quality-lead [SETUP]
           → task-assignments.json (품질 기준 정의)
         4명 병렬 (fact-checker, logic-validator, bias-detector,
                   final-reviewer)
           → member-*.json (4개)
         quality-lead [VERDICT]
           → team-report.json (GO / NO-GO 판정)

         NO-GO 시: 문제 팀 재실행 (최대 3회)

Step 5: 보안팀 (implementation/testing 단계만) ─────────────
         security-lead [TASK ASSIGNMENT]
           → task-assignments.json (위협 모델 기반 선별)
         N명 병렬 (위협 모델에 따라 15명 중 선택)
           → member-*.json
         security-lead [SYNTHESIS]
           → team-report.json (보안 점수 1-10, PASS/FAIL)

         FAIL 시: 수정 후 재검증 (최대 3회)

Step 6: 단계 완료 ─────────────────────────────────────────
         final-report.json 생성
         사용자에게 요약 제시
         다음 단계 진행 여부 확인
```

### 2.2 데이터 흐름

각 팀은 이전 팀의 `team-report.json`을 입력으로 받습니다:

```
research team-report.json
  ↓
debate (조사 결과를 기반으로 토론 주제 설정)
  ↓ debate team-report.json
  ↓
synthesis (조사 + 토론 결과를 통합)
  ↓ synthesis team-report.json
  ↓
quality (조사 + 토론 + 종합 결과를 검증)
  ↓ quality team-report.json (GO/NO-GO)
  ↓
security (코드/구현 결과를 감사)
  ↓ security team-report.json (PASS/FAIL)
  ↓
final-report.json (모든 팀 결과 통합)
```

---

## 3. 에이전트 상세 — 팀별

### 3.1 조사팀 (Research) — 6명

**목적:** 프로젝트 주제에 대한 다각도 사실 조사

| 에이전트 | 모델 | 전문 분야 | 출력 내용 |
|---------|------|----------|----------|
| **research-lead** | opus | 작업 배분 + 결과 종합 | 교차 분석된 통합 보고서 |
| web-researcher | sonnet | 문서, 기술 참조, 표준, 사례 | 공식 문서 기반 사실 정리 |
| market-analyst | sonnet | TAM/SAM/SOM, 성장률, 수익 모델 | 시장 규모 + 세분화 분석 |
| tech-researcher | sonnet | 기술 스택, 아키텍처, 벤치마크 | 기술 비교표 + 장단점 |
| trend-analyst | sonnet | 기술/비즈니스/규제 트렌드 | 미래 전망 + 리스크 요인 |
| competitor-analyst | sonnet | 경쟁사 기능 비교, SWOT, 포지셔닝 | 차별화 전략 인사이트 |

**research-lead의 종합 프로세스:**
1. 5명의 결과를 모두 읽음
2. 2명 이상이 동의하는 점 → "합의 사항"
3. 서로 모순되는 점 → 증거 강도로 판단
4. 어느 팀원도 다루지 않은 빈 영역 → "지식 격차"로 기록

---

### 3.2 토론팀 (Debate) — 8명

**목적:** 조사 결과를 기반으로 다양한 관점에서 구조화된 논쟁

| 에이전트 | 모델 | 관점 | 역할 |
|---------|------|------|------|
| **debate-lead** | opus | 진행자 | 토론 주제 설정 + 결과 종합 |
| optimist | sonnet | 긍정 | 장점, 성장 잠재력, 공격적 전략 주장 |
| pessimist | sonnet | 부정 | 리스크, 실패 시나리오, 한계 강조 |
| realist | sonnet | 현실 | 실현 가능성 기반 균형 분석 (50:50 금지) |
| innovator | sonnet | 혁신 | 파괴적 아이디어, 비전통적 해법 제안 |
| conservative | sonnet | 보수 | 안정성, 검증된 방법, 하위 호환성 강조 |
| devils-advocate | sonnet | 반론 | 모든 합의의 논리적 허점 공격 |
| moderator | sonnet | 중립 | 3라운드 전체 종합 (토론에 참여하지 않음) |

**3라운드 토론 구조:**

```
Round 1 (Opening)
  각 토론자가 독립적으로 자기 포지션 제시
  증거 기반 주장 + 근거 제시

Round 2 (Cross-Examination)
  모든 토론자가 Round 1 전원의 주장을 읽음
  약한 주장 공격 + 자기 포지션 방어
  상대 논거에 대한 구체적 반박

Round 3 (Rebuttal)
  Round 1 + Round 2 전체를 읽음
  최종 입장 정리
  증거가 압도적인 부분은 양보
  핵심 주장만 유지
```

**moderator의 종합 프로세스:**
1. 18개 파일 전체 읽기 (6명 × 3라운드)
2. 각 토론자의 포지션 변화 추적 (양보한 것, 유지한 것)
3. 가장 강한 주장 식별 (증거 품질 기준)
4. 합의 영역 / 미해결 긴장 / 생존한 핵심 논점 매핑
5. 특정 토론자 편을 들지 않는 공정한 요약

**왜 moderator가 Sonnet인데 이 작업을 할 수 있는가:**
moderator는 "판단"이 아니라 "요약"을 합니다. 18개 파일에서 정보를 추출하고 구조화하는 작업이므로 Sonnet으로 충분합니다. 반면 **debate-lead**(Opus)는 토론 결과에 대한 메타 판단(합의 수준 0-1 점수 등)을 내립니다.

---

### 3.3 종합팀 (Synthesis) — 8명

**목적:** 조사 + 토론 결과를 실행 가능한 전략으로 변환

| 에이전트 | 모델 | 전문 분야 | 출력 내용 |
|---------|------|----------|----------|
| **synthesis-lead** | opus | 통합 조율 | 충돌 해소 + 일관된 전략 문서 |
| integrator | sonnet | 지식 통합 | 조사-토론 교차 분석 → 통합 지식 기반 |
| strategist | sonnet | 전략 수립 | 우선순위 로드맵 + 리소스 배분 |
| report-writer | sonnet | 보고서 작성 | 경영진 요약 + 상세 보고서 |
| execution-planner | sonnet | 실행 계획 | Epic → Story → Task 분해 + 스프린트 계획 |
| risk-manager | sonnet | 리스크 관리 | 리스크 레지스트리 + 완화 전략 |
| metrics-designer | sonnet | KPI 설계 | KPI/OKR + 측정 프레임워크 |
| change-manager | sonnet | 변경 관리 | 이해관계자 영향 + 커뮤니케이션 계획 |

**synthesis-lead의 통합 프로세스:**
1. 7명 결과에서 충돌 식별 (예: strategist의 공격적 일정 vs risk-manager의 보수적 권고)
2. 증거 품질로 충돌 해소, 해소 불가능한 건 명시
3. 전략/실행/리스크/KPI를 하나의 일관된 문서로 통합

---

### 3.4 품질팀 (Quality) — 5명

**목적:** 이전 팀들의 결과를 독립적으로 검증하고 Go/No-Go 판정

| 에이전트 | 모델 | 검증 영역 | 방법 |
|---------|------|----------|------|
| **quality-lead** | opus | 종합 판정 | 이슈 집계 + Go/No-Go 규칙 적용 |
| fact-checker | haiku | 사실 검증 | 주장을 검색으로 확인 → verified/unverified/false/outdated |
| logic-validator | sonnet | 논리 검증 | 전제→결론 관계, 순환 논증, 비약 탐지 |
| bias-detector | sonnet | 편향 검출 | 확증 편향, 생존자 편향, 프레이밍 효과 등 |
| final-reviewer | opus | 전체 일관성 | 완결성, 일관성, 실행 가능성, 준비 상태 |

**Go/No-Go 판정 규칙:**
- Critical 이슈 1개 이상 → **NO-GO**
- Important 이슈 2개 이상 (서로 다른 리뷰어) → **NO-GO**
- 그 외 → **GO**

NO-GO 시: 문제가 있는 팀을 지정하여 수정 요청, 최대 3회 재시도.

---

### 3.5 보안팀 (Security) — 16명

**목적:** implementation/testing 단계에서 코드/인프라 보안 감사

**security-lead의 3가지 모드:**

| 모드 | 동작 | 시점 |
|------|------|------|
| **Mode 1: TASK ASSIGNMENT** | 위협 모델 분석 → 필요한 멤버만 선별 호출 | 보안팀 시작 |
| **Mode 2: SYNTHESIS** | 결과 종합 → 보안 점수(1-10) → PASS/FAIL | 멤버 완료 후 |
| **Mode 3: RE-VERIFICATION** | 수정 확인 → 점수 재계산 | FAIL 후 수정 시 |

**15명 보안 전문가 (위협 모델에 따라 선별 호출):**

| 에이전트 | 전문 영역 | 호출 조건 |
|---------|----------|----------|
| security-auditor | OWASP Top 10 | 항상 |
| dependency-scanner | CVE, 라이선스 | 항상 |
| secrets-scanner | API 키, 비밀번호 노출 | 항상 |
| api-security-auditor | 인증/인가, 데이터 노출 | API가 있을 때 |
| network-attack-reviewer | SSRF, 요청 스머글링 | 네트워크 I/O 시 |
| iac-security-scanner | Terraform, K8s 설정 | IaC 파일 존재 시 |
| container-security-scanner | Dockerfile, Pod 보안 | 컨테이너 사용 시 |
| supply-chain-auditor | CI/CD 보안, 빌드 무결성 | CI/CD 설정 시 |
| crypto-auditor | 암호화 알고리즘, TLS | 암호화 코드 시 |
| compliance-checker | GDPR, PCI DSS, HIPAA | 규제 데이터 시 |
| smart-contract-auditor | 재진입, 오버플로우 | 스마트 컨트랙트 시 |
| mobile-security-auditor | OWASP MASVS | 모바일 앱 시 |
| threat-intel-monitor | 최신 CVE, 위협 정보 | 항상 (후반) |
| pentest-simulator | 공격 경로 매핑 | 항상 (후반) |
| incident-response-planner | 사고 대응 플레이북 | 항상 (후반) |

**보안 점수 체계:**
- 10점: 발견 없음
- 8-9점: Low만
- 6-7점: Medium만
- 4-5점: High 존재
- 1-3점: Critical 존재
- **PASS**: 점수 6 이상 + Critical/High 없음
- **FAIL**: 나머지

---

### 3.6 코드팀 (Code) — 6명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **code-lead** | opus | 실행 계획 → 코딩 태스크 분해 + 결과 통합 검증 |
| code-architect | sonnet | 아키텍처 결정 → 파일/모듈 구조, 인터페이스 정의 |
| frontend-developer | sonnet | 컴포넌트, 페이지, 레이아웃, 상태 관리, 라우팅 |
| backend-developer | sonnet | API 엔드포인트, 비즈니스 로직, 미들웨어, 인증 |
| code-reviewer-impl | opus | 코드 리뷰 (read-only, 수정 불가) |
| refactorer | sonnet | 기술 부채 감소, 패턴 추출, 중복 제거 |

### 3.7 테스트팀 (Test) — 4명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **testing-lead** | opus | 테스트 전략 정의 + 커버리지 타겟 설정 |
| unit-test-writer | sonnet | 함수/모듈 단위 테스트 (AAA 패턴) |
| integration-test-writer | sonnet | API 계약, DB 쿼리, 서비스 간 통신 |
| test-runner | haiku | 테스트 실행 + 결과 파싱 + 커버리지 보고 |

### 3.8 DevOps팀 — 6명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **devops-lead** | opus | Git/CI/CD 워크플로우 계획 + 검증 |
| git-strategist | sonnet | 브랜치 전략, 버전 스킴, 머지 정책 |
| release-manager | sonnet | 체인지로그, 버전 범핑, 태그, 릴리스 노트 |
| hotfix-handler | sonnet | 긴급 수정 워크플로우 |
| pr-manager | sonnet | PR 생성, 라벨, 리뷰어, 머지 전략 |
| ci-cd-monitor | sonnet | CI/CD 파이프라인 모니터링 + 실패 분석 |

### 3.9 DB팀 — 3명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **database-lead** | opus | 스키마 설계 전략 + 마이그레이션 계획 |
| data-modeler | sonnet | 엔티티, 관계, 인덱스, 정규화 결정 |
| migration-writer | sonnet | 가역적 마이그레이션 파일 작성 (up/down) |

### 3.10 인프라팀 — 3명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **infra-lead** | opus | 인프라 계획 + 보안/비용/확장성 검토 |
| containerizer | haiku | Dockerfile, docker-compose, 멀티스테이지 빌드 |
| infra-coder | sonnet | Terraform, K8s 매니페스트, CI/CD 파이프라인 |

### 3.11 문서팀 — 3명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| **docs-lead** | opus | 필요 문서 파악 + 작업 배분 + 정확성 검토 |
| api-doc-writer | sonnet | OpenAPI 스펙, 엔드포인트 문서, 인증 가이드 |
| guide-writer | haiku | README, 시작 가이드, 설정 레퍼런스, FAQ |

### 3.12 메타 에이전트 — 1명

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| harness-optimizer | sonnet | 에이전트 성능 분석 + 개선 권고 |

---

## 4. 보안 훅 시스템

### 4.1 동작 원리

`.claude/settings.json`에 등록된 3개 훅이 에이전트의 도구 호출을 가로챕니다:

```
에이전트가 Write/Edit/Bash 호출
  ↓
[PreToolUse] pre-security-gate.js
  ├── 보호 파일? → 경고 또는 차단
  ├── 시크릿 패턴? → 경고 또는 차단
  ├── 위험 명령? → 경고 또는 차단
  └── 통과 → 도구 실행 허용

에이전트가 Agent 도구 호출 (서브에이전트)
  ↓
[PreToolUse] pre-agent-timing.js
  └── 시작 시간 기록 (임시 파일)

에이전트 실행 완료
  ↓
[PostToolUse] track-agent-execution.js
  └── 실행 시간, 토큰 추정, 에이전트 ID → SQLite DB
```

### 4.2 보안 검사 항목

| 검사 | 탐지 대상 | 예시 |
|------|----------|------|
| 보호 파일 | `.claude/settings.json`, `CLAUDE.md`, `.env`, `.env.*` | 설정 파일 무단 변경 방지 |
| 시크릿 패턴 | API 키, 비밀번호, 토큰, Private Key | `api_key: "sk_live_..."` |
| 위험 명령 | 파괴적 셸 명령 | `rm -rf`, `git push --force`, `DROP TABLE` |
| 경로 탈출 | 프로젝트 외부 쓰기 | `../../../etc/passwd` |

### 4.3 운영 모드

`HARNESS_HOOK_PROFILE` 환경변수로 제어:

| 모드 | 동작 | 용도 |
|------|------|------|
| `standard` (기본) | stderr 경고만 출력, 실행은 허용 | 일상 개발 |
| `strict` | exit code 2로 실제 차단 | 프로덕션/배포 전 |
| `minimal` | Bash 명령만 검사 | 디버깅/문제 해결 시 |

---

## 5. 크로스세션 학습

5개 팀 리더에 `memory: project` 필드가 적용되어 있습니다:

```yaml
memory: project
```

이 필드가 적용된 에이전트는 `.claude/agent-memory/` 디렉토리에 **세션 간 학습 데이터를 자동 저장**합니다.

| 리더 | 학습하는 것 |
|------|-----------|
| research-lead | 이전 조사에서 유용했던 소스, 반복되는 주제 |
| synthesis-lead | 이전 전략 문서의 패턴, 효과적이었던 통합 방식 |
| quality-lead | 반복되는 품질 이슈, 자주 실패하는 검증 항목 |
| security-lead | 프로젝트의 보안 프로필, 이전에 발견된 취약점 유형 |
| code-lead | 프로젝트 아키텍처 결정, 코드 구조 패턴 |

---

## 6. 사용 시나리오

### 6.1 오케스트레이터 파이프라인 (전체 팀 협업)

```
/orchestrator "실시간 채팅 기반 여행 예약 시스템"
```

**결과:** 5개 팀이 순차적으로 조사→토론→종합→검증→(보안감사)를 수행하여, 다각도로 검증된 전략 문서를 생성합니다.

**적합한 경우:**
- 새 프로젝트/기능의 초기 설계
- 기술 선택 시 다각도 분석이 필요할 때
- 의사결정 근거를 구조적으로 문서화해야 할 때

### 6.2 독립 에이전트 사용 (특정 작업)

오케스트레이터 없이 개별 에이전트를 직접 사용:

```
"이 코드의 보안 취약점을 검사해줘"
→ security-auditor 자동 위임

"PR을 만들어줘"
→ pr-manager 자동 위임

"사용자 테이블을 설계해줘"
→ data-modeler 자동 위임

"에이전트 성능을 분석해줘"
→ harness-optimizer 자동 위임
```

**적합한 경우:**
- 단일 전문 영역의 작업
- 빠른 결과가 필요할 때
- 비용을 절약하고 싶을 때 (파이프라인 대비 1/69 비용)

### 6.3 부분 파이프라인 (팀 단위)

특정 팀만 호출하여 부분적으로 활용:

```
# 보안팀만 실행 (코드 리뷰 후)
"security-lead를 사용해서 이 구현의 보안을 검토해줘"

# 코드팀만 실행 (아키텍처 결정 후)
"code-lead에게 이 아키텍처를 기반으로 코딩 태스크를 분배해줘"
```

---

## 7. 출력 포맷

모든 에이전트는 동일한 JSON 스키마로 결과를 출력합니다 (`agents/schemas/output-format.md`):

```json
{
  "agent": "에이전트 이름",
  "team": "소속 팀",
  "phase": "SDLC 단계",
  "timestamp": "ISO-8601",
  "input_summary": "받은 입력 요약",
  "findings": [
    { "title": "발견 제목", "detail": "상세 설명", "evidence": "근거" }
  ],
  "recommendations": [
    { "action": "권고 행동", "priority": "high|medium|low", "rationale": "이유" }
  ],
  "confidence_score": 0.85,
  "concerns": [
    { "issue": "우려 사항", "severity": "critical|important|minor", "mitigation": "완화 방안" }
  ],
  "sources": ["참조 출처"]
}
```

팀별 확장 필드:
- **토론팀**: `round`, `position`, `arguments[]`, `counterarguments[]`
- **품질팀**: `verdict`, `checklist[]`
- **팀 리더**: `member_summaries[]`, `consolidated_findings[]`, `team_decision`
- **품질 리더**: `verdict: "go|no-go"`, `required_fixes[]`, `retry_count`
- **보안 리더**: `security_score: 1-10`, `vulnerabilities[]`, `attack_chains[]`

---

## 8. 디렉토리 구조 해설

```
.claude/
  agents/                # 69개 에이전트 정의 (.md)
    schemas/             #   에이전트 내부에서 참조하는 스키마 사본
  hooks/
    pre-security-gate.js #   보안 검사 (Write/Edit/Bash 가로챔)
    pre-agent-timing.js  #   실행 시간 측정 시작
    track-agent-execution.js  # 실행 기록 → SQLite
  skills/
    orchestrator/SKILL.md #  파이프라인 오케스트레이션 정의
  settings.json          #   훅 등록 설정

agents/
  schemas/output-format.md  # 공통 출력 JSON 스키마 (원본)
  templates/basic-agent.md  # 새 에이전트 작성 템플릿

catalog/
  taxonomy.md            # 11개 카테고리별 에이전트 매핑

docs/
  system-guide.md        # 이 문서
  global-installation-guide.md  # 전역 설치 + 사용법
  plans/                 # 설계 문서
  research/              # 기술 연구
```
