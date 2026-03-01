# Claude Agent - 멀티에이전트 파이프라인 프로젝트

Claude Code 서브에이전트 시스템을 연구하고, 구조화된 멀티에이전트 파이프라인을 구축하는 프로젝트.

## 핵심 시스템: Orchestrated Agent Teams

`/orchestrator` 스킬로 4개 팀(27개 에이전트)이 순차 실행되는 파이프라인.

```
오케스트레이터 (스킬)
  ├── 조사팀 (6): research-lead + 5 specialists
  ├── 토론팀 (8): debate-lead + 6 debaters + moderator
  ├── 종합팀 (8): synthesis-lead + 7 specialists
  └── 품질팀 (5): quality-lead + 3 validators + final-reviewer
```

**파일 기반 오케스트레이션**: 서브에이전트 깊이=1 제약을 우회. 팀리더가 지시서 생성 → 메인이 팀원 병렬 호출 → 팀리더 resume으로 종합.

## 디렉토리 구조

```
.claude/
  agents/              # 27개 에이전트 정의 파일
  skills/orchestrator/  # 오케스트레이터 스킬
research/              # 서브에이전트 시스템 연구 자료
agents/
  schemas/             # 공통 출력 포맷 스키마
  templates/           # 에이전트 템플릿
  drafts/              # 개발 중인 에이전트 초안
catalog/               # 에이전트 인벤토리
docs/plans/            # 설계 문서 및 구현 계획
output/                # 파이프라인 실행 결과 (gitignore)
```

## 규칙

- 연구 문서는 한국어로 작성
- 에이전트 정의 파일(.md)은 영어로 작성 (Claude Code 호환성)
- 모든 에이전트는 `agents/schemas/output-format.md`의 JSON 포맷으로 결과 출력
- 팀리더는 opus, 팀원은 sonnet 모델 사용 (final-reviewer 예외: opus)
- output/ 디렉토리의 결과 파일은 커밋하지 않음
