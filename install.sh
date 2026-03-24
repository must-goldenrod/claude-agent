#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────
# Claude Agent Harness — Global Installer
# 69 agents + orchestrator skill + schemas → ~/.claude/
# ─────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
AGENTS_SRC="${SCRIPT_DIR}/.claude/agents"
SKILLS_SRC="${SCRIPT_DIR}/.claude/skills"
AGENTS_DST="${CLAUDE_DIR}/agents"
SKILLS_DST="${CLAUDE_DIR}/skills"
BACKUP_DIR="${CLAUDE_DIR}/backup/claude-agent-$(date +%Y%m%d-%H%M%S)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─────────────────────────────────────────────────
# Preflight checks
# ─────────────────────────────────────────────────
preflight() {
  info "Preflight checks..."

  if [[ ! -d "${AGENTS_SRC}" ]]; then
    error "Source agents directory not found: ${AGENTS_SRC}"
    exit 1
  fi

  if [[ ! -d "${CLAUDE_DIR}" ]]; then
    error "~/.claude directory not found. Is Claude Code installed?"
    exit 1
  fi

  mkdir -p "${AGENTS_DST}" "${SKILLS_DST}"
  ok "Preflight passed"
}

# ─────────────────────────────────────────────────
# Backup existing agents that will be overwritten
# ─────────────────────────────────────────────────
backup_existing() {
  local conflicts=()

  for src_file in "${AGENTS_SRC}"/*.md; do
    local name
    name="$(basename "${src_file}")"
    if [[ -f "${AGENTS_DST}/${name}" ]]; then
      conflicts+=("${name}")
    fi
  done

  if [[ ${#conflicts[@]} -gt 0 ]]; then
    warn "${#conflicts[@]} existing agents will be overwritten"
    mkdir -p "${BACKUP_DIR}/agents"
    for name in "${conflicts[@]}"; do
      cp "${AGENTS_DST}/${name}" "${BACKUP_DIR}/agents/${name}"
    done
    ok "Backed up to ${BACKUP_DIR}/agents/"
  else
    info "No existing agents to backup"
  fi

  # Backup existing orchestrator skill if present
  if [[ -f "${SKILLS_DST}/orchestrator/SKILL.md" ]]; then
    mkdir -p "${BACKUP_DIR}/skills/orchestrator"
    cp "${SKILLS_DST}/orchestrator/SKILL.md" "${BACKUP_DIR}/skills/orchestrator/"
    ok "Backed up existing orchestrator skill"
  fi
}

# ─────────────────────────────────────────────────
# Install agents (69 .md files + schemas/)
# ─────────────────────────────────────────────────
install_agents() {
  info "Installing agents..."

  # Copy all agent definition files
  local count=0
  for src_file in "${AGENTS_SRC}"/*.md; do
    cp "${src_file}" "${AGENTS_DST}/"
    count=$((count + 1))
  done
  ok "${count} agent files installed"

  # Copy schemas directory
  if [[ -d "${AGENTS_SRC}/schemas" ]]; then
    cp -r "${AGENTS_SRC}/schemas" "${AGENTS_DST}/"
    ok "Output format schemas installed"
  fi
}

# ─────────────────────────────────────────────────
# Install orchestrator skill
# ─────────────────────────────────────────────────
install_orchestrator() {
  info "Installing orchestrator skill..."
  mkdir -p "${SKILLS_DST}/orchestrator"
  cp -r "${SKILLS_SRC}/orchestrator/"* "${SKILLS_DST}/orchestrator/"
  ok "Orchestrator skill installed"
}

# ─────────────────────────────────────────────────
# Verify installation
# ─────────────────────────────────────────────────
verify() {
  info "Verifying installation..."
  local errors=0

  # Check agent count
  local agent_count
  agent_count=$(ls "${AGENTS_DST}"/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${agent_count}" -lt 69 ]]; then
    error "Expected ≥69 agents, found ${agent_count}"
    errors=$((errors + 1))
  else
    ok "Agents: ${agent_count} files"
  fi

  # Check schemas
  if [[ -f "${AGENTS_DST}/schemas/output-format.md" ]]; then
    ok "Schemas: output-format.md present"
  else
    error "Missing: agents/schemas/output-format.md"
    errors=$((errors + 1))
  fi

  # Check orchestrator
  if [[ -f "${SKILLS_DST}/orchestrator/SKILL.md" ]]; then
    ok "Skill: orchestrator/SKILL.md present"
  else
    error "Missing: skills/orchestrator/SKILL.md"
    errors=$((errors + 1))
  fi

  # Check critical pipeline agents
  local required_leaders=(
    research-lead debate-lead synthesis-lead quality-lead
    security-lead code-lead testing-lead database-lead
    devops-lead infra-lead docs-lead
  )
  local missing_leaders=()
  for leader in "${required_leaders[@]}"; do
    if [[ ! -f "${AGENTS_DST}/${leader}.md" ]]; then
      missing_leaders+=("${leader}")
    fi
  done

  if [[ ${#missing_leaders[@]} -gt 0 ]]; then
    error "Missing team leaders: ${missing_leaders[*]}"
    errors=$((errors + 1))
  else
    ok "All 11 team leaders present"
  fi

  # Check model routing (sample check)
  local routing_ok=true
  for leader in research-lead debate-lead security-lead; do
    if ! grep -q "model:.*opus" "${AGENTS_DST}/${leader}.md" 2>/dev/null; then
      warn "${leader} may have incorrect model routing (expected opus)"
      routing_ok=false
    fi
  done
  for haiku_agent in test-runner containerizer guide-writer fact-checker; do
    if ! grep -q "model:.*haiku" "${AGENTS_DST}/${haiku_agent}.md" 2>/dev/null; then
      warn "${haiku_agent} may have incorrect model routing (expected haiku)"
      routing_ok=false
    fi
  done
  if [[ "${routing_ok}" == true ]]; then
    ok "Model routing: spot check passed"
  fi

  echo ""
  if [[ ${errors} -eq 0 ]]; then
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation complete! All checks passed ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  else
    echo -e "${RED}═══════════════════════════════════════════${NC}"
    echo -e "${RED}  Installation finished with ${errors} error(s) ${NC}"
    echo -e "${RED}═══════════════════════════════════════════${NC}"
    exit 1
  fi
}

# ─────────────────────────────────────────────────
# Print usage summary
# ─────────────────────────────────────────────────
print_usage() {
  echo ""
  echo -e "${BLUE}Usage:${NC}"
  echo "  In any Claude Code session, run:"
  echo ""
  echo "    /orchestrator \"your project description\""
  echo ""
  echo "  Or use individual agents automatically via PROACTIVE triggers."
  echo ""
  echo -e "${YELLOW}Note:${NC}"
  echo "  Security hooks are project-local only."
  echo "  For security gate enforcement, copy this repo's .claude/hooks/"
  echo "  to your target project and register in .claude/settings.json."
  echo ""
  if [[ -d "${BACKUP_DIR}" ]]; then
    echo -e "${BLUE}Backup:${NC} ${BACKUP_DIR}"
    echo ""
  fi
}

# ─────────────────────────────────────────────────
# Uninstall
# ─────────────────────────────────────────────────
uninstall() {
  info "Uninstalling Claude Agent Harness from global..."

  # Read the list from the source to know what we installed
  for src_file in "${AGENTS_SRC}"/*.md; do
    local name
    name="$(basename "${src_file}")"
    if [[ -f "${AGENTS_DST}/${name}" ]]; then
      rm "${AGENTS_DST}/${name}"
    fi
  done

  rm -rf "${AGENTS_DST}/schemas"
  rm -rf "${SKILLS_DST}/orchestrator"

  ok "Uninstalled. Original agents were not touched (only our agents removed)."
  echo "  If you have a backup, restore from: ~/.claude/backup/"
}

# ─────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────
main() {
  echo ""
  echo "╔═══════════════════════════════════════════╗"
  echo "║  Claude Agent Harness — Global Installer  ║"
  echo "║  69 agents · 11 teams · orchestrator      ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""

  case "${1:-install}" in
    install)
      preflight
      backup_existing
      install_agents
      install_orchestrator
      verify
      print_usage
      ;;
    uninstall)
      uninstall
      ;;
    verify)
      verify
      ;;
    *)
      echo "Usage: $0 [install|uninstall|verify]"
      exit 1
      ;;
  esac
}

main "$@"
