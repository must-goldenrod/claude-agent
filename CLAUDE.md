# Claude Agent - 멀티에이전트 파이프라인 프로젝트

Claude Code 서브에이전트 시스템을 연구하고, 구조화된 멀티에이전트 파이프라인을 구축하는 프로젝트.

## 핵심 시스템: Orchestrated Agent Teams

`/orchestrator` 스킬로 10개 팀(68개 에이전트)이 파일 기반 오케스트레이션으로 운영되는 파이프라인.

```
오케스트레이터 (스킬)
  ├── 조사팀 (6): research-lead + web-researcher, market-analyst, tech-researcher, trend-analyst, competitor-analyst
  ├── 토론팀 (8): debate-lead + optimist, pessimist, realist, innovator, conservative, devils-advocate, moderator
  ├── 종합팀 (8): synthesis-lead + integrator, strategist, report-writer, execution-planner, risk-manager, metrics-designer, change-manager
  ├── 품질팀 (5): quality-lead + fact-checker, logic-validator, bias-detector, final-reviewer
  ├── DevOps팀 (6): devops-lead + git-strategist, release-manager, hotfix-handler, pr-manager, ci-cd-monitor
  ├── 코드구현팀 (6): code-lead + code-architect, frontend-developer, backend-developer, code-reviewer-impl, refactorer
  ├── 테스트팀 (4): testing-lead + unit-test-writer, integration-test-writer, test-runner
  ├── DB팀 (3): database-lead + data-modeler, migration-writer
  ├── 보안팀 (16): security-lead + security-auditor, dependency-scanner, secrets-scanner, iac-security-scanner, supply-chain-auditor, api-security-auditor, compliance-checker, crypto-auditor, threat-intel-monitor, network-attack-reviewer, container-security-scanner, incident-response-planner, pentest-simulator, smart-contract-auditor, mobile-security-auditor
  ├── 문서팀 (3): docs-lead + api-doc-writer, guide-writer
  └── 인프라팀 (3): infra-lead + containerizer, infra-coder
```

**파일 기반 오케스트레이션**: 서브에이전트 깊이=1 제약을 우회. 팀리더가 지시서 생성 → 메인이 팀원 병렬 호출 → 팀리더 resume으로 종합.

## 디렉토리 구조

```
.claude/
  agents/              # 68개 에이전트 정의 파일
  skills/orchestrator/  # 오케스트레이터 스킬
  hooks/               # Claude Code hooks (에이전트 추적)
  settings.json        # Hook 등록 설정
marketplace/           # 에이전트 성능 추적 시스템 (MVP)
  src/                 # 핵심 모듈 (db, tracker, validator, cli)
  tests/               # 테스트 (vitest)
  bin/                 # CLI 엔트리포인트
research/              # 서브에이전트 시스템 연구 자료
agents/
  schemas/             # 공통 출력 포맷 스키마
  templates/           # 에이전트 템플릿
  drafts/              # 개발 중인 에이전트 초안
catalog/               # 에이전트 인벤토리
docs/plans/            # 설계 문서 및 구현 계획
output/                # 파이프라인 실행 결과 (gitignore)
```

## Agent Marketplace

`marketplace/` 디렉토리에 에이전트 성능 추적 및 평가 시스템.

- PreToolUse + PostToolUse Hook이 Agent 도구 호출을 자동 캡처 → SQLite에 저장
- 4축 복합 평가: 품질(0.35) + 효율(0.25) + 신뢰(0.25) + 기여(0.15)
- 품질 평가: 스키마 검증 (자동) + LLM 평가 (haiku) + 사용자 피드백
- 효율 평가: 실행 시간, 토큰 추정량, 재시도율 (Hook 자동 수집)
- 신뢰 평가: 스키마 준수율, 실패율, 출력 안정성 (자동 계산)
- 기여 평가: 사용 빈도, 파이프라인 위치 가중치 (자동 계산)
- DB 위치: `~/.claude/agent-marketplace.db`

CLI 명령어:
- `node marketplace/bin/agent-tracker.js agents` — 전체 에이전트 목록
- `node marketplace/bin/agent-tracker.js stats <agent-id>` — 에이전트 통계
- `node marketplace/bin/agent-tracker.js list <agent-id>` — 실행 기록
- `node marketplace/bin/agent-tracker.js eval llm <agent-id>` — LLM 평가 실행
- `node marketplace/bin/agent-tracker.js eval rate <exec-id> -s 0.8` — 사용자 피드백
- `node marketplace/bin/agent-tracker.js eval report <agent-id>` — 평가 리포트
- `node marketplace/bin/agent-tracker.js eval score <exec-id>` — 종합 스코어
- `node marketplace/bin/agent-tracker.js market search <query>` — 에이전트 검색
- `node marketplace/bin/agent-tracker.js market install <name>` — 에이전트 설치
- `node marketplace/bin/agent-tracker.js market publish <file>` — 에이전트 공개
- `node marketplace/bin/agent-tracker.js market bulk-publish <dir>` — 일괄 공개
- `node marketplace/bin/agent-tracker.js market list` — 레지스트리 목록
- `node marketplace/bin/agent-tracker.js profile show <agent-id>` — 4축 성능 프로필
- `node marketplace/bin/agent-tracker.js profile show <agent-id> --json` — JSON 출력
- `node marketplace/bin/agent-tracker.js profile refresh [agent-id]` — 프로필 재계산 (전체 또는 특정)
- `node marketplace/bin/agent-tracker.js profile team` — 전체 에이전트 프로필 순위

## 규칙

- 연구 문서는 한국어로 작성
- 에이전트 정의 파일(.md)은 영어로 작성 (Claude Code 호환성)
- 모든 에이전트는 `agents/schemas/output-format.md`의 JSON 포맷으로 결과 출력
- 팀리더는 opus, 팀원은 sonnet 모델 사용 (예외: final-reviewer, code-reviewer-impl은 opus)
- output/ 디렉토리의 결과 파일은 커밋하지 않음
- 에이전트 프롬프트에서 표준 스키마 필드는 `_standard_fields` 참조로 대체 (토큰 최적화)

## 보안 코딩 규칙

marketplace/ 코드 작성 시 반드시 준수해야 하는 보안 패턴. 2026-03-22 보안 감사에서 수립됨.

### 입력 검증
- **에이전트 이름/태그**: `validateAgentName()` 또는 `/^[a-z0-9][a-z0-9._-]{0,63}$/` 화이트리스트 패턴 사용
- **파일 경로**: 모든 사용자 입력 경로는 `safePath(baseDir, untrusted)` 통과 필수 (CWE-22 방지)
- **JSON 추출**: LLM 응답에서 JSON 추출 시 balanced-brace 파서 사용. `/\{[^}]+\}/` 같은 naive regex 금지 (중첩 JSON 절삭 위험)
- 검증 함수 위치: `marketplace/src/sanitize.js`

### 데이터 보호
- **세션 ID**: DB 저장 전 `crypto.createHash('sha256').update(id).digest('hex').slice(0, 16)` 해싱 필수
- **민감 파일 권한**: DB 파일은 `0o600`, 디렉토리는 `0o700`으로 생성. `fs.chmodSync()` 명시적 호출
- **에러 메시지**: stderr 로그에 내부 경로, 스키마, 스택 트레이스 노출 금지. 일반화된 메시지만 출력

### 안정성
- **JSON.parse 안전성**: DB나 외부 소스 데이터에 대한 `JSON.parse()`는 반드시 try-catch로 감싸고, 파싱 실패 시 기본값(zero-value) 반환
- **Silent failure 금지**: 모든 `catch` 블록은 `process.stderr.write()` 등으로 에러 로깅 필수. 빈 catch 금지
- **Symlink 방어**: 사용자 영향 가능 경로에 파일 쓰기 전 `fs.lstatSync().isSymbolicLink()` 확인 필수

### 설정
- **하드코딩 금지**: 모델명 등 변경 가능한 값은 환경변수 fallback 지원 (예: `process.env.AGENT_EVAL_MODEL || 'default'`)

### 테스트
- 보안 수정에는 반드시 대응하는 테스트 작성: `marketplace/tests/security-fixes.test.js` (유닛), `marketplace/tests/security-integration.test.js` (통합)
- 보안 테스트는 악의적 입력, 손상 데이터, 경계값을 반드시 포함
