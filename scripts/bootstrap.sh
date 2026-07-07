#!/usr/bin/env bash
#
# bootstrap.sh — turn a freshly-copied/cloned Helios template into a new app
# in as close to one command as possible.
#
# Runs, in order: the identity stamp-out (scripts/setup.mjs), `pnpm install`,
# updater signing-key generation (scripts/generate-signing-key.sh), and an
# optional fresh git history — then prints the remaining manual steps.
#
# Written for POSIX-ish bash, including macOS's default bash 3.2 — no
# `declare -A`, no `mapfile`, no other bash-4-only constructs.
#
set -euo pipefail

prog="$(basename "$0")"

err() { printf '%s: error: %s\n' "$prog" "$*" >&2; }
die() { err "$*"; exit 1; }
step() { printf '\n==> %s\n' "$*"; }
info() { printf '%s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap.sh --name <kebab-name> [options]

One command to turn this freshly-copied Helios template into your own app:
stamp out the identity, install deps, generate an updater signing key, and
(optionally) start a fresh git history.

Options:
  --name <kebab>        App name, kebab-case (e.g. acme-notes). Required
                        unless running interactively (you'll be prompted).
  --display <name>      Display / product name (default: Title Case of --name)
  --identifier <id>     Reverse-DNS bundle id (default: com.jeremymax.<name>)
  --repo <owner/repo>   GitHub slug (default: itsJeremyMax/<name>)
  --author <name>       Author / crate author (default: repo owner)
  --skip-install        Do not run `pnpm install`
  --skip-keygen         Do not generate an updater signing key
  --fresh-git           Remove .git, re-init, and make an initial commit
  --yes                 Non-interactive; requires --name. Uses a random key
                        password (via generate-signing-key.sh --random).
  -h, --help            Show this help.

Examples:
  ./scripts/bootstrap.sh --name my-app --display "My App"
  ./scripts/bootstrap.sh --name acme-notes --yes --fresh-git
EOF
}

# --------------------------------------------------------------- parse args
NAME=""
DISPLAY=""
IDENTIFIER=""
REPO=""
AUTHOR=""
SKIP_INSTALL=0
SKIP_KEYGEN=0
FRESH_GIT=0
YES=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name)       [ "$#" -ge 2 ] || die "missing value for --name"; NAME="$2"; shift 2 ;;
    --display)    [ "$#" -ge 2 ] || die "missing value for --display"; DISPLAY="$2"; shift 2 ;;
    --identifier) [ "$#" -ge 2 ] || die "missing value for --identifier"; IDENTIFIER="$2"; shift 2 ;;
    --repo)       [ "$#" -ge 2 ] || die "missing value for --repo"; REPO="$2"; shift 2 ;;
    --author)     [ "$#" -ge 2 ] || die "missing value for --author"; AUTHOR="$2"; shift 2 ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-keygen)  SKIP_KEYGEN=1; shift ;;
    --fresh-git)    FRESH_GIT=1; shift ;;
    --yes|-y)       YES=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

# ------------------------------------------------------------ resolve root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# --------------------------------------------------------- step 1: guards
step "Checking this is an unmodified Helios template"
[ -f "$REPO_ROOT/scripts/bootstrap.sh" ] || die "must run from the repo root (scripts/bootstrap.sh not found)"
[ -f "$REPO_ROOT/package.json" ] || die "package.json not found at repo root"
command -v node >/dev/null 2>&1 || die "required tool not found: node"

PKG_NAME="$(node -e 'const fs=require("fs");process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).name||""))' "$REPO_ROOT/package.json")"
if [ "$PKG_NAME" != "helios" ]; then
  die "package.json name is \"$PKG_NAME\", not \"helios\" — this template is already stamped out. Refusing to bootstrap twice (that would double-rename tokens). Nothing changed."
fi
info "OK: template is unmodified (package.json name = helios)."

# ---------------------------------------------------- step 2: interactive
if [ "$YES" -eq 1 ] && [ -z "$NAME" ]; then
  die "--yes is non-interactive and requires --name"
fi

if [ -z "$NAME" ] && [ "$YES" -ne 1 ]; then
  step "Interactive setup (press Enter to accept the shown default)"
  while [ -z "$NAME" ]; do
    printf 'App name (kebab-case, e.g. acme-notes): ' >&2
    read -r NAME
    [ -n "$NAME" ] || info "  name is required."
  done
  # Compute the same defaults setup.mjs would, to show them in the prompts.
  def_display="$(printf '%s' "$NAME" | awk -F- '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1' OFS=' ')"
  printf 'Display name [%s]: ' "$def_display" >&2; read -r ans; [ -n "$ans" ] && DISPLAY="$ans"
  printf 'Bundle identifier [com.jeremymax.%s]: ' "$NAME" >&2; read -r ans; [ -n "$ans" ] && IDENTIFIER="$ans"
  printf 'GitHub repo (owner/repo) [itsJeremyMax/%s]: ' "$NAME" >&2; read -r ans; [ -n "$ans" ] && REPO="$ans"
  def_author="${REPO%%/*}"; [ -n "$def_author" ] || def_author="itsJeremyMax"
  printf 'Author [%s]: ' "$def_author" >&2; read -r ans; [ -n "$ans" ] && AUTHOR="$ans"
fi

[ -n "$NAME" ] || die "--name is required"

# --------------------------------------------------- step 3: stamp out
step "Stamping out the template identity (scripts/setup.mjs)"
set -- --name "$NAME"
[ -n "$DISPLAY" ]    && set -- "$@" --display "$DISPLAY"
[ -n "$IDENTIFIER" ] && set -- "$@" --identifier "$IDENTIFIER"
[ -n "$REPO" ]       && set -- "$@" --repo "$REPO"
[ -n "$AUTHOR" ]     && set -- "$@" --author "$AUTHOR"
node "$REPO_ROOT/scripts/setup.mjs" "$@" || die "setup.mjs failed — nothing else was run"

# The display name may have been defaulted inside setup.mjs; recompute a
# best-effort value for our own summary messages.
if [ -z "$DISPLAY" ]; then
  DISPLAY="$(printf '%s' "$NAME" | awk -F- '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1' OFS=' ')"
fi

# --------------------------------------------------- step 4: pnpm install
if [ "$SKIP_INSTALL" -eq 1 ]; then
  step "Skipping dependency install (--skip-install)"
else
  step "Installing dependencies (pnpm install)"
  command -v pnpm >/dev/null 2>&1 || die "pnpm not found — install it (corepack enable) or re-run with --skip-install"
  pnpm install || die "pnpm install failed"
fi

# --------------------------------------------------- step 5: signing key
if [ "$SKIP_KEYGEN" -eq 1 ]; then
  step "Skipping updater signing-key generation (--skip-keygen)"
  info "Remember to run scripts/generate-signing-key.sh before you ship a release."
else
  step "Generating the updater signing key (scripts/generate-signing-key.sh)"
  set -- --name "$NAME"
  [ -n "$REPO" ] && set -- "$@" --repo "$REPO"

  SET_SECRETS=0
  if command -v gh >/dev/null 2>&1; then
    if [ "$YES" -ne 1 ]; then
      printf 'Push the signing key to this repo'\''s GitHub Actions secrets now? [y/N]: ' >&2
      read -r ans
      case "$ans" in [Yy]*) SET_SECRETS=1 ;; esac
    fi
  fi

  if [ "$YES" -eq 1 ]; then
    # Non-interactive: random password so the key generates without a prompt.
    set -- "$@" --random
  fi
  [ "$SET_SECRETS" -eq 1 ] && set -- "$@" --set-secrets

  bash "$REPO_ROOT/scripts/generate-signing-key.sh" "$@" || die "generate-signing-key.sh failed"
fi

# --------------------------------------------------- step 6: fresh git
if [ "$FRESH_GIT" -eq 1 ]; then
  step "Starting a fresh git history (--fresh-git)"
  command -v git >/dev/null 2>&1 || die "git not found — cannot --fresh-git"
  rm -rf "$REPO_ROOT/.git"
  git -C "$REPO_ROOT" init >/dev/null
  git -C "$REPO_ROOT" add -A
  git -C "$REPO_ROOT" commit -m "chore: initialize $DISPLAY from Helios template" >/dev/null
  info "Fresh git repo initialized with an initial commit."
else
  step "Leaving git history alone"
  info "The template's git history is intact. Use --fresh-git to start clean,"
  info "or run \`git add -A && git commit\` yourself when ready."
fi

# ------------------------------------------------------------- summary
cat <<EOF

============================================================================
  Bootstrap complete — "$DISPLAY" ($NAME)
============================================================================
  Done:
    - Stamped the template identity across the tree (setup.mjs).
$( [ "$SKIP_INSTALL" -eq 1 ] && printf '    - (skipped) pnpm install\n' || printf '    - Installed dependencies (pnpm install).\n' )
$( [ "$SKIP_KEYGEN" -eq 1 ] && printf '    - (skipped) updater signing key\n' || printf '    - Generated the updater signing key + wired its pubkey into tauri.conf.json.\n' )
$( [ "$FRESH_GIT" -eq 1 ] && printf '    - Started a fresh git history with an initial commit.\n' || printf '    - Left git history intact.\n' )

  Remaining manual steps:
    1. Create the GitHub repo (if it does not exist) and push:
         gh repo create ${REPO:-<owner>/$NAME} --source . --private --push
    2. BACK UP your signing key (\$HOME/.tauri/$NAME.key + its password).
       Losing it permanently breaks updates for installed apps.
$( [ "$SKIP_KEYGEN" -ne 1 ] && printf '       If you did not push secrets above, run: scripts/generate-signing-key.sh --set-secrets\n' )
    3. Run the app once:  pnpm tauri dev
    4. Work through the owner checklist in docs/RELEASE_VERIFICATION.md
       (Actions billing, Dependabot, branch ruleset, first release, updater proof).
============================================================================
EOF
