# Claude Code Sub-Agent 인벤토리

## 프로젝트 에이전트 (68개)

10개 팀으로 구성된 멀티에이전트 파이프라인. 팀리더(opus)가 작업 지시 및 종합, 팀원(sonnet)이 전문 분석 수행.

### 조사팀 (Research) — cyan

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `research-lead` | opus | Read, Write, Grep, Glob | 조사 작업 배분 및 결과 종합 |
| `web-researcher` | sonnet | Read, Grep, Glob, WebSearch, WebFetch, Write | 외부 문서/기술 참조/표준 조사 |
| `market-analyst` | sonnet | Read, WebSearch, WebFetch, Write | 시장 규모/성장률/수익 모델 분석 |
| `tech-researcher` | sonnet | Read, Grep, Glob, WebSearch, WebFetch, Write | 기술 스택 비교/아키텍처 패턴 분석 |
| `trend-analyst` | sonnet | Read, WebSearch, WebFetch, Write | 기술/비즈니스 트렌드/규제 동향 분석 |
| `competitor-analyst` | sonnet | Read, WebSearch, WebFetch, Write | 경쟁사 기능 비교/포지셔닝 분석 |

### 토론팀 (Debate) — magenta

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `debate-lead` | opus | Read, Write | 토론 주제 설정/3라운드 관리/최종 평가 |
| `optimist` | sonnet | Read, Write | 긍정적 관점: 장점/성장 잠재력 주장 |
| `pessimist` | sonnet | Read, Write | 비관적 관점: 리스크/위협 강조 |
| `realist` | sonnet | Read, Write | 현실적 관점: 증거 기반 균형 분석 |
| `innovator` | sonnet | Read, WebSearch, Write | 혁신 관점: 새로운 접근/기술 제안 |
| `conservative` | sonnet | Read, Write | 보수적 관점: 안정성/검증된 방법 선호 |
| `devils-advocate` | sonnet | Read, Write | 반대론자: 모든 주장의 약점 공격 |
| `moderator` | sonnet | Read, Write | 3라운드 토론 요약/합의점 도출 |

### 종합팀 (Synthesis) — green

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `synthesis-lead` | opus | Read, Write, Grep, Glob | 종합 작업 배분 및 전략 통합 |
| `integrator` | sonnet | Read, Write | 조사+토론 결과 교차 참조/핵심 인사이트 추출 |
| `strategist` | sonnet | Read, Write | 로드맵/우선순위/GTM 전략 수립 |
| `report-writer` | sonnet | Read, Write | 의사결정 문서/보고서 작성 |
| `execution-planner` | sonnet | Read, Write | 에픽/스프린트/작업 분해 |
| `risk-manager` | sonnet | Read, Write | 리스크 레지스트리 및 완화 전략 |
| `metrics-designer` | sonnet | Read, Write | KPI/OKR/모니터링 대시보드 설계 |
| `change-manager` | sonnet | Read, Write | 변경 영향 분석/롤백 전략 |

### 품질팀 (Quality) — red

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `quality-lead` | opus | Read, Write, Grep, Glob | 품질 기준 설정/Go/No-Go 최종 판정 |
| `fact-checker` | sonnet | Read, WebSearch, WebFetch, Write | 주장 검증/데이터 정확성 확인 |
| `logic-validator` | sonnet | Read, Write | 논리적 모순/순환 논증/비약 탐지 |
| `bias-detector` | sonnet | Read, Write | 편향 탐지 (과낙관/확증편향/고정관념 등) |
| `final-reviewer` | opus | Read, Write | 최종 종합 품질 게이트 (완전성/일관성/준비도) |

### DevOps팀 — yellow

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `devops-lead` | opus | Read, Write, Grep, Glob, Bash | Git/CI/CD 작업 배분 및 검증 |
| `git-strategist` | sonnet | Read, Write, Bash, Grep | 브랜치 전략/버전관리 정책 |
| `release-manager` | sonnet | Read, Write, Bash, Grep, Glob | 릴리즈 관리/변경로그/버전 범핑 |
| `hotfix-handler` | sonnet | Read, Write, Bash, Grep, Glob | 핫픽스 브랜치/체리픽/긴급 배포 |
| `pr-manager` | sonnet | Read, Write, Bash, Grep, Glob | PR 생성/리뷰 체크리스트/라벨링 |
| `ci-cd-monitor` | sonnet | Read, Write, Bash, Grep, Glob | CI/CD 파이프라인 상태 분석/실패 진단 |

### 코드구현팀 (Code) — blue

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `code-lead` | opus | Read, Write, Edit, Grep, Glob, Bash | 구현 작업 배분/통합 리뷰 |
| `code-architect` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 프로젝트 스캐폴딩/인터페이스 정의 |
| `frontend-developer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | UI 컴포넌트/상태관리/접근성 |
| `backend-developer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | API/비즈니스로직/DB 통합 |
| `code-reviewer-impl` | opus | Read, Grep, Glob, Bash | 코드 리뷰 (읽기 전용 — Write 없음) |
| `refactorer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 코드 리팩토링/중복 제거/패턴 적용 |

### 테스트팀 (Testing) — green

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `testing-lead` | opus | Read, Write, Grep, Glob, Bash | 테스트 전략 수립/결과 종합 |
| `unit-test-writer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 유닛 테스트 작성/실행 |
| `integration-test-writer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 통합 테스트 작성/실행 |
| `test-runner` | sonnet | Read, Write, Bash, Grep, Glob | 테스트 실행/커버리지 분석/실패 분류 |

### DB팀 (Database) — cyan

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `database-lead` | opus | Read, Write, Grep, Glob, Bash | DB 작업 배분/스키마 리뷰 |
| `data-modeler` | sonnet | Read, Write, Bash, Grep | 엔티티/관계/인덱스/정규화 설계 |
| `migration-writer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | 마이그레이션 파일 작성/데이터 이전 |

### 보안팀 (Security) — red

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `security-lead` | opus | Read, Write, Grep, Glob, Bash | 보안 평가 전략/위협 모델링/15명 팀 조율/최종 판정 |
| `security-auditor` | sonnet | Read, Grep, Glob, Bash, Write | OWASP Web Top 10 코드 감사/SAST 연동 |
| `dependency-scanner` | sonnet | Read, Bash, Grep, Glob, Write, WebSearch | CVE 스캔/라이선스 호환성/SBOM/컨테이너 이미지 |
| `secrets-scanner` | sonnet | Read, Grep, Glob, Bash, Write | Git 히스토리/코드 시크릿 탐지/엔트로피 분석 |
| `iac-security-scanner` | sonnet | Read, Grep, Glob, Bash, Write | Terraform/K8s/Dockerfile/CloudFormation 보안 검사 |
| `supply-chain-auditor` | sonnet | Read, Grep, Glob, Bash, Write, WebSearch | CI/CD 파이프라인/빌드 무결성/lockfile 변조 탐지 |
| `api-security-auditor` | opus | Read, Grep, Glob, Bash, Write | OWASP API Top 10/JWT·OAuth/GraphQL 보안 |
| `compliance-checker` | opus | Read, Grep, Glob, Write | GDPR/PCI DSS/HIPAA/SOC 2 컴플라이언스 매핑 |
| `crypto-auditor` | sonnet | Read, Grep, Glob, Write | 암호화 알고리즘/키 파생/TLS/PRNG 감사 |
| `threat-intel-monitor` | sonnet | Read, Glob, Grep, WebSearch, WebFetch, Write | CVE 매칭/KEV 카탈로그/벤더 보안 공지 모니터링 |
| `network-attack-reviewer` | sonnet | Read, Grep, Glob, Write | SSRF 심층분석/요청 스머글링/오픈 리다이렉트/WebSocket |
| `container-security-scanner` | sonnet | Read, Grep, Glob, Bash, Write | 컨테이너 이미지/docker-compose/K8s PSS/시크릿 관리 |
| `incident-response-planner` | opus | Read, Grep, Glob, Write | 사고 대응 플레이북/모니터링 규칙/포렌식 체크리스트 |
| `pentest-simulator` | opus | Read, Grep, Glob, Write | 취약점 연쇄/MITRE ATT&CK 매핑/폭발 반경 평가 |
| `smart-contract-auditor` | opus | Read, Grep, Glob, Write | OWASP SC Top 10/DeFi 보안/프록시 계약 |
| `mobile-security-auditor` | sonnet | Read, Grep, Glob, Write | OWASP MASVS/딥링크 인젝션/WebView 보안 |

### 문서팀 (Documentation) — green

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `docs-lead` | opus | Read, Write, Grep, Glob | 문서 작업 배분/품질 리뷰 |
| `api-doc-writer` | sonnet | Read, Write, Edit, Grep, Glob | API 엔드포인트/요청·응답/에러 코드 문서화 |
| `guide-writer` | sonnet | Read, Write, Edit, Grep, Glob | README/시작 가이드/배포 가이드 작성 |

### 인프라팀 (Infrastructure) — yellow

| 에이전트 | 모델 | 도구 | 역할 |
|----------|------|------|------|
| `infra-lead` | opus | Read, Write, Grep, Glob, Bash | 인프라 작업 배분/비용·보안 리뷰 |
| `containerizer` | sonnet | Read, Write, Edit, Bash, Grep, Glob | Dockerfile/docker-compose/이미지 최적화 |
| `infra-coder` | sonnet | Read, Write, Edit, Bash, Grep, Glob | Terraform/K8s/CI-CD/모니터링 코드 작성 |

---

## 시스템 에이전트 (24개)

빌트인 5 + 플러그인 19. 프로젝트와 독립적으로 Claude Code에서 제공.

### 빌트인 에이전트 (5개)

| 타입 | 용도 | 비고 |
|------|------|------|
| `general-purpose` | 범용 멀티스텝 작업 | 기본값 |
| `Explore` | 코드베이스 탐색/검색 | 읽기 전용 |
| `Plan` | 구현 계획 설계 | 읽기 전용 |
| `claude-code-guide` | Claude Code 사용법 안내 | API/SDK 질문 |
| `code-simplifier` | 코드 단순화/정리 | 최근 수정 코드 |

### 플러그인 에이전트 (19개)

agent-sdk-dev(2), feature-dev(3), pr-review-toolkit(6), plugin-dev(3), hookify(1), superpowers(1), skill-creator(3)

상세 내역은 이전 버전 참조.
