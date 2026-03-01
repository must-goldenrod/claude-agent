# Claude Code Sub-Agent 인벤토리

총 **24개** 에이전트 (빌트인 5 + 플러그인 19)

## 빌트인 에이전트 (5개)

Agent 도구의 `subagent_type` 파라미터로 지정. 별도 파일 없이 시스템에 내장.

| 타입 | 용도 | 도구 접근 | 비고 |
|------|------|-----------|------|
| `general-purpose` | 범용 멀티스텝 작업 | 전체 | 기본값 |
| `Explore` | 코드베이스 탐색/검색 | 읽기 전용 (Edit, Write 제외) | quick/medium/very thorough 레벨 |
| `Plan` | 구현 계획 설계 | 읽기 전용 (Edit, Write 제외) | 아키텍처 트레이드오프 분석 |
| `claude-code-guide` | Claude Code 사용법 안내 | Glob, Grep, Read, WebFetch, WebSearch | Claude Code/Agent SDK/API 질문용 |
| `code-simplifier` | 코드 단순화/정리 | 전체 | 최근 수정 코드에 집중 |

## 플러그인 에이전트 (19개)

### agent-sdk-dev (2개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `agent-sdk-verifier-py` | sonnet | Python Agent SDK 앱 검증 |
| `agent-sdk-verifier-ts` | sonnet | TypeScript Agent SDK 앱 검증 |

### feature-dev (3개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `code-architect` | sonnet | 기능 아키텍처 설계, 구현 청사진 생성 |
| `code-explorer` | sonnet | 코드베이스 심층 분석, 실행 경로 추적 |
| `code-reviewer` | sonnet | 버그/보안/코드 품질 리뷰 (신뢰도 ≥80만 보고) |

### pr-review-toolkit (6개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `code-reviewer` | opus | CLAUDE.md 준수 여부 중심 코드 리뷰 |
| `code-simplifier` | opus | 코드 단순화/리팩터링 |
| `comment-analyzer` | inherit | 주석 정확성/유지보수성 분석 |
| `pr-test-analyzer` | inherit | 테스트 커버리지 품질 검토 |
| `silent-failure-hunter` | inherit | 무음 실패/부적절한 에러 핸들링 탐지 |
| `type-design-analyzer` | inherit | 타입 설계 품질 분석 (캡슐화, 불변조건) |

### plugin-dev (3개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `agent-creator` | sonnet | 새 에이전트 .md 파일 생성 |
| `plugin-validator` | inherit | 플러그인 구조/설정 검증 |
| `skill-reviewer` | inherit | 스킬 품질 평가 및 개선 |

### hookify (1개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `conversation-analyzer` | inherit | 대화 분석 → 훅으로 방지할 패턴 탐지 |

### superpowers (1개)

| 에이전트 | 모델 | 용도 |
|----------|------|------|
| `code-reviewer` | inherit | 구현 계획 대비 완성도 리뷰 |

### skill-creator (3개) — 내부용

| 에이전트 | 용도 |
|----------|------|
| `comparator` | A/B 블라인드 비교 판정 |
| `grader` | 실행 결과 기대치 평가 |
| `analyzer` | 비교 결과 분석 및 개선 제안 |

## 중복/유사 에이전트 분석

### code-reviewer (4개 변형)
- **feature-dev**: 버그/보안 중심, sonnet, 신뢰도 기반 필터링
- **pr-review-toolkit**: CLAUDE.md 스타일 가이드 준수 중심, opus
- **superpowers**: 구현 계획 대비 검토 중심, inherit
- 각각 초점이 다르므로 용도에 따라 선택

### code-simplifier (3개 변형)
- **빌트인**: 기본 코드 정리
- **pr-review-toolkit**: PR 맥락에서 코드 정리, opus
- **standalone plugin**: pr-review-toolkit과 동일 내용
