# Claude Agent — 하네스 엔지니어링 멀티에이전트 파이프라인

Claude Code 서브에이전트 69개를 11개 팀으로 구조화하고, 하네스 엔지니어링을 적용한 파이프라인 프로젝트.

## 핵심 시스템

`/orchestrator` 스킬로 11개 팀(69개 에이전트)이 파일 기반 오케스트레이션으로 운영됨.

```
오케스트레이터 (스킬)
  ├── 조사팀 (6): research-lead + web-researcher, market-analyst, tech-researcher, trend-analyst, competitor-analyst
  ├── 토론팀 (8): debate-lead + optimist, pessimist, realist, innovator, conservative, devils-advocate, moderator
  ├── 종합팀 (8): synthesis-lead + integrator, strategist, report-writer, execution-planner, risk-manager, metrics-designer, change-manager
  ├── 품질팀 (5): quality-lead + fact-checker, logic-validator, bias-detector, final-reviewer
  ├── 코드팀 (6): code-lead + code-architect, frontend-developer, backend-developer, code-reviewer-impl, refactorer
  ├── 테스트팀 (4): testing-lead + unit-test-writer, integration-test-writer, test-runner
  ├── DB팀 (3): database-lead + data-modeler, migration-writer
  ├── 보안팀 (16): security-lead + 15명
  ├── DevOps팀 (6): devops-lead + git-strategist, release-manager, hotfix-handler, pr-manager, ci-cd-monitor
  ├── 인프라팀 (3): infra-lead + containerizer, infra-coder
  ├── 문서팀 (3): docs-lead + api-doc-writer, guide-writer
  └── 메타 (1): harness-optimizer
```

**파일 기반 오케스트레이션**: 서브에이전트 깊이=1 제약을 우회. 팀리더가 지시서 생성 → 메인이 팀원 병렬 호출 → 팀리더 resume으로 종합.

## 디렉토리 구조

```
.claude/
  agents/              # 69개 에이전트 정의 파일
  hooks/               # 보안 훅 + 추적 훅 (3개)
  skills/orchestrator/  # 오케스트레이터 스킬
  settings.json        # Hook 등록 설정
agents/
  schemas/             # 공통 출력 포맷 스키마
  templates/           # 에이전트 생성 템플릿
catalog/
  taxonomy.md          # 11개 카테고리별 에이전트 매핑
docs/
  plans/               # 설계 문서 및 구현 계획
  research/            # 서브에이전트 시스템 기술 연구
  global-installation-guide.md  # 전역 설치 가이드
```

## 규칙

- 연구 문서는 한국어로 작성
- 에이전트 정의 파일(.md)은 영어로 작성 (Claude Code 호환성)
- 모든 에이전트는 `agents/schemas/output-format.md`의 JSON 포맷으로 결과 출력
- 모델 라우팅: 팀리더 opus, 팀원 sonnet, 단순 작업 haiku (test-runner, containerizer, guide-writer, fact-checker)
- 예외: final-reviewer, code-reviewer-impl은 opus
- 5개 팀리더(research, synthesis, quality, security, code)에 `memory: project` 적용

## 보안 훅

`pre-security-gate.js`가 Write/Edit/Bash 도구 호출을 자동 검사:

- 보호 파일 수정 차단 (`.claude/settings.json`, `CLAUDE.md`, `.env` 등)
- 시크릿 패턴 탐지 (API 키, 비밀번호, Private Key)
- 위험 명령 차단 (`rm -rf`, `git push --force`, `DROP TABLE`)
- 프로젝트 외부 경로 쓰기 차단

**환경변수:** `HARNESS_HOOK_PROFILE` (standard=경고, strict=차단, minimal=Bash만)

## 보안 코딩 규칙

hooks/ 코드 작성 시 준수할 패턴:

### 입력 검증
- **에이전트 이름/태그**: `/^[a-z0-9][a-z0-9._-]{0,63}$/` 화이트리스트 패턴
- **파일 경로**: 경로 순회 검증 (`path.relative`로 `..` 탐지)
- **JSON 추출**: balanced-brace 파서 사용. naive regex 금지

### 안정성
- **JSON.parse**: 외부 데이터는 반드시 try-catch, 파싱 실패 시 기본값 반환
- **Silent failure 금지**: 모든 catch 블록에 `process.stderr.write()` 에러 로깅
- **Symlink 방어**: 파일 쓰기 전 `fs.lstatSync().isSymbolicLink()` 확인
