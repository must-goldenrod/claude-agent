# Claude Agent - Sub-Agent 연구 및 개발 프로젝트

Claude Code의 서브에이전트 시스템을 연구, 관리, 개발하기 위한 프로젝트.

## 프로젝트 목적

- Claude Code 서브에이전트 시스템 동작 원리 이해
- 기존 에이전트 패턴 분석 및 카탈로그화
- 새로운 커스텀 에이전트 설계 및 개발
- 에이전트 품질 평가 및 개선

## 디렉토리 구조

```
research/          # 서브에이전트 시스템 연구 자료
agents/            # 에이전트 개발
  templates/       # 재사용 가능한 에이전트 템플릿
  drafts/          # 개발 중인 에이전트 초안
catalog/           # 에이전트 인벤토리 및 분석
```

## 규칙

- 연구 문서는 한국어로 작성
- 에이전트 정의 파일(.md)은 영어로 작성 (Claude Code 호환성)
- 에이전트 개발 시 `plugin-dev` 플러그인의 `agent-creator` 에이전트 활용
- 새 에이전트 작성 전 `catalog/inventory.md`에서 기존 에이전트와 중복 여부 확인

## 핵심 참고 경로

- 빌트인 에이전트: Agent 도구의 `subagent_type` 파라미터 (general-purpose, Explore, Plan, claude-code-guide, code-simplifier)
- 플러그인 에이전트: `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/*/agents/*.md`
- 에이전트 개발 레퍼런스: `~/.claude/plugins/.../plugin-dev/skills/agent-development/`
