# Agent Taxonomy — 카테고리별 에이전트 매핑

> 참고 문서. frontmatter에는 반영하지 않음 (Claude Code `category` 필드 미지원).
> 오케스트레이터 및 팀 관리 참조용.

**총 69개 에이전트** (harness-optimizer 포함)

---

## plan/ — 기획, 조사, 분석 (6)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| research-lead | opus | 조사팀 리더 |
| web-researcher | sonnet | 웹 기반 자료 조사 |
| market-analyst | sonnet | 시장 분석 |
| tech-researcher | sonnet | 기술 스택 평가 |
| trend-analyst | sonnet | 트렌드 분석 |
| competitor-analyst | sonnet | 경쟁사 분석 |

## debate/ — 토론 (8)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| debate-lead | opus | 토론팀 리더 |
| optimist | sonnet | 긍정적 관점 |
| pessimist | sonnet | 부정적 관점 |
| realist | sonnet | 현실적 관점 |
| innovator | sonnet | 혁신적 관점 |
| conservative | sonnet | 보수적 관점 |
| devils-advocate | sonnet | 반론 전문 |
| moderator | sonnet | 토론 종합 |

## synthesis/ — 전략 수립, 종합 (8)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| synthesis-lead | opus | 종합팀 리더 |
| integrator | sonnet | 연구-토론 교차 분석 |
| strategist | sonnet | 전략 방향 수립 |
| report-writer | sonnet | 보고서 작성 |
| execution-planner | sonnet | 실행 계획 분해 |
| risk-manager | sonnet | 리스크 관리 |
| metrics-designer | sonnet | KPI/OKR 설계 |
| change-manager | sonnet | 변경 영향 분석 |

## quality/ — 품질 관리 (5)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| quality-lead | opus | 품질팀 리더 |
| fact-checker | **haiku** | 사실 검증 |
| logic-validator | sonnet | 논리 검증 |
| bias-detector | sonnet | 편향 검출 |
| final-reviewer | opus | 최종 Go/No-Go |

## build/ — 구현, 빌드 (6)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| code-lead | opus | 코드팀 리더 |
| code-architect | sonnet | 아키텍처 → 구조 변환 |
| frontend-developer | sonnet | 클라이언트 UI |
| backend-developer | sonnet | 서버 사이드 |
| code-reviewer-impl | opus | 코드 리뷰 (read-only) |
| refactorer | sonnet | 기술 부채 정리 |

## test/ — 테스트 (4)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| testing-lead | opus | 테스트팀 리더 |
| unit-test-writer | sonnet | 유닛 테스트 작성 |
| integration-test-writer | sonnet | 통합 테스트 작성 |
| test-runner | **haiku** | 테스트 실행/보고 |

## security/ — 보안 (16)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| security-lead | opus | 보안팀 리더 |
| security-auditor | sonnet | OWASP Top 10 감사 |
| dependency-scanner | sonnet | CVE/라이선스 스캔 |
| secrets-scanner | sonnet | 시크릿 탐지 |
| iac-security-scanner | sonnet | IaC 보안 스캔 |
| supply-chain-auditor | sonnet | 공급망 감사 |
| api-security-auditor | opus | API 보안 심층 분석 |
| compliance-checker | opus | 규정 준수 점검 |
| crypto-auditor | sonnet | 암호화 감사 |
| threat-intel-monitor | sonnet | 위협 인텔리전스 |
| network-attack-reviewer | sonnet | 네트워크 공격 분석 |
| container-security-scanner | sonnet | 컨테이너 보안 |
| incident-response-planner | opus | 사고 대응 계획 |
| pentest-simulator | opus | 침투 테스트 시뮬레이션 |
| smart-contract-auditor | opus | 스마트 컨트랙트 감사 |
| mobile-security-auditor | sonnet | 모바일 보안 감사 |

## ops/ — DevOps (6)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| devops-lead | opus | DevOps팀 리더 |
| git-strategist | sonnet | 브랜치 전략 |
| release-manager | sonnet | 릴리스 관리 |
| hotfix-handler | sonnet | 긴급 수정 |
| pr-manager | sonnet | PR 라이프사이클 |
| ci-cd-monitor | sonnet | CI/CD 모니터링 |

## db/ — 데이터베이스 (3)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| database-lead | opus | DB팀 리더 |
| data-modeler | sonnet | 스키마 설계 |
| migration-writer | sonnet | 마이그레이션 작성 |

## infra/ — 인프라 (3)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| infra-lead | opus | 인프라팀 리더 |
| containerizer | **haiku** | Dockerfile/compose |
| infra-coder | sonnet | IaC 코드 |

## docs/ — 문서화 (3)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| docs-lead | opus | 문서팀 리더 |
| api-doc-writer | sonnet | API 레퍼런스 |
| guide-writer | **haiku** | 사용자 가이드 |

## meta/ — 메타 에이전트 (1)

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| harness-optimizer | sonnet | 4축 프로파일 기반 개선 권고 |

---

## 모델 분포 요약

| 모델 | 수 | 비율 |
|------|---|------|
| Opus | 18 | 26% |
| Sonnet | 47 | 68% |
| Haiku | 4 | 6% |
| **합계** | **69** | 100% |
