#!/usr/bin/env bash
#
# generate-signing-key.sh — generate (or rotate) this app's Tauri updater
# signing keypair, wire the public key into src-tauri/tauri.conf.json, and
# optionally push the private key + password to GitHub Actions secrets.
#
# Reusable standalone (for key rotation) and callable by scripts/bootstrap.sh.
#
# Written for POSIX-ish bash, including macOS's default bash 3.2 — no
# `declare -A`, no `mapfile`, no other bash-4-only constructs.
#
set -euo pipefail

# ------------------------------------------------------------------ helpers
prog="$(basename "$0")"

err() { printf '%s: error: %s\n' "$prog" "$*" >&2; }
die() { err "$*"; exit 1; }
info() { printf '%s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage: scripts/generate-signing-key.sh [options]

Generate (or rotate) the Tauri UPDATER signing keypair for THIS app and wire
its public key into src-tauri/tauri.conf.json (plugins.updater.pubkey).

Options:
  --name <stem>       Key filename stem (default: package.json "name")
  --out <dir>         Output directory for the key (default: $HOME/.tauri)
  --password <pw>     Use this password for the private key
  --random            Generate a strong random password and save it to a
                      sibling <stem>.key.password file (umask 077)
  --set-secrets       Push the private key + password to GitHub Actions
                      secrets via `gh` (TAURI_SIGNING_PRIVATE_KEY[_PASSWORD])
  --repo <owner/repo> Target repo for --set-secrets (default: from `git
                      remote get-url origin`)
  --force             Overwrite an existing key / password file. Without this,
                      the script REFUSES to clobber an existing key, because
                      losing the key that signed shipped releases permanently
                      breaks updates for already-installed apps.
  -h, --help          Show this help.

Password source precedence: --password, else --random, else an interactive
hidden prompt (asked twice). The private key is NEVER printed.

Note: the tauri CLI's `signer generate` only accepts the key password as a
command-line argument (no env-var or stdin path), so for the brief lifetime of
that one call the password is visible to other local users via `ps` — this is
true for every mode (--password, --random, and the interactive prompt alike).
On a shared/multi-user host, prefer --random: the ps window is unavoidable, but
the exposed password is a locally-generated throwaway written straight to a
0600 file, so nothing you reuse elsewhere leaks. Best of all, run this on a
machine only you can inspect.
EOF
}

# --------------------------------------------------------------- parse args
NAME=""
OUT_DIR=""
PASSWORD=""
PASSWORD_SET=0
RANDOM_PW=0
SET_SECRETS=0
REPO=""
FORCE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name)     [ "$#" -ge 2 ] || die "missing value for --name"; NAME="$2"; shift 2 ;;
    --out)      [ "$#" -ge 2 ] || die "missing value for --out"; OUT_DIR="$2"; shift 2 ;;
    --password) [ "$#" -ge 2 ] || die "missing value for --password"; PASSWORD="$2"; PASSWORD_SET=1; shift 2 ;;
    --random)   RANDOM_PW=1; shift ;;
    --set-secrets) SET_SECRETS=1; shift ;;
    --repo)     [ "$#" -ge 2 ] || die "missing value for --repo"; REPO="$2"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

if [ "$PASSWORD_SET" -eq 1 ] && [ "$RANDOM_PW" -eq 1 ]; then
  die "--password and --random are mutually exclusive"
fi

# ------------------------------------------------------------ resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONF_PATH="$REPO_ROOT/src-tauri/tauri.conf.json"
PKG_PATH="$REPO_ROOT/package.json"

[ -f "$CONF_PATH" ] || die "not found: $CONF_PATH (run from the Helios repo)"
[ -f "$PKG_PATH" ] || die "not found: $PKG_PATH (run from the Helios repo)"

# --------------------------------------------------------------- check deps
need() { command -v "$1" >/dev/null 2>&1 || die "required tool not found: $1"; }
need node
need pnpm
if [ "$SET_SECRETS" -eq 1 ]; then
  command -v gh >/dev/null 2>&1 || die "--set-secrets needs the GitHub CLI (gh) — install it or drop --set-secrets"
fi

# ---------------------------------------------------------- derive defaults
if [ -z "$NAME" ]; then
  NAME="$(node -e 'const fs=require("fs");process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).name||""))' "$PKG_PATH")"
  [ -n "$NAME" ] || die "could not derive key name from package.json; pass --name"
fi

# Validate the key stem with the same kebab-case rule setup.mjs enforces, so a
# stray space or "../" can never smuggle its way into the key file path.
case "$NAME" in
  *[!a-z0-9-]* | [!a-z]* | *- | *--* | "")
    die "--name must be kebab-case: start with a lowercase letter, then lowercase letters/digits/single dashes — got \"$NAME\"" ;;
esac

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="${HOME}/.tauri"
fi

if [ "$SET_SECRETS" -eq 1 ] && [ -z "$REPO" ]; then
  origin="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  [ -n "$origin" ] || die "--set-secrets needs a repo: none passed and no git 'origin' remote found (use --repo owner/repo)"
  # Normalise https:// and git@ forms to owner/repo.
  REPO="$origin"
  REPO="${REPO#https://github.com/}"
  REPO="${REPO#git@github.com:}"
  REPO="${REPO%.git}"
  case "$REPO" in
    */*) : ;;
    *) die "could not parse owner/repo from origin '$origin' — pass --repo owner/repo" ;;
  esac
fi

KEY_PATH="$OUT_DIR/$NAME.key"
PUB_PATH="$KEY_PATH.pub"
PW_PATH="$KEY_PATH.password"

# --------------------------------------------------------- clobber guards
mkdir -p "$OUT_DIR"

if [ -f "$KEY_PATH" ] && [ "$FORCE" -ne 1 ]; then
  die "key already exists: $KEY_PATH
  Refusing to overwrite. This key signs your shipped releases; replacing it
  permanently breaks in-app updates for every ALREADY-INSTALLED copy of the
  app (they only trust the old public key). If you truly mean to rotate it,
  re-run with --force and understand the consequences."
fi

# ------------------------------------------------------- resolve password
if [ "$RANDOM_PW" -eq 1 ]; then
  if [ -f "$PW_PATH" ] && [ "$FORCE" -ne 1 ]; then
    die "password file already exists: $PW_PATH (re-run with --force to overwrite)"
  fi
  if command -v openssl >/dev/null 2>&1; then
    PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
  else
    PASSWORD="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
  # Write under a tight umask AND chmod explicitly: `>` truncation reuses an
  # existing file's (possibly looser) permissions, so umask alone is not enough
  # on the --force overwrite path.
  ( umask 077; printf '%s' "$PASSWORD" > "$PW_PATH" )
  chmod 600 "$PW_PATH"
  info "Wrote random key password to $PW_PATH (mode 600)."
elif [ "$PASSWORD_SET" -ne 1 ]; then
  # No password source given: only safe if we can prompt on a real terminal.
  # A piped/scripted invocation (no TTY) would read an empty line and silently
  # generate a PASSWORDLESS key — refuse instead and point at --random.
  if [ ! -t 0 ] || [ ! -t 2 ]; then
    die "no password provided and no terminal to prompt on. Pass --random (recommended) or --password <pw> for non-interactive use."
  fi
  # Interactive: prompt twice, hidden.
  printf 'Enter a password for the new signing key (input hidden): ' >&2
  read -r -s pw1; printf '\n' >&2
  printf 'Confirm password: ' >&2
  read -r -s pw2; printf '\n' >&2
  [ "$pw1" = "$pw2" ] || die "passwords did not match"
  [ -n "$pw1" ] || die "empty password refused — use --random or provide a real password"
  PASSWORD="$pw1"
fi

# ----------------------------------------------------------- generate key
info "Generating updater signing key for '$NAME' -> $KEY_PATH"
# SECURITY — password on argv: `tauri signer generate` has no env-var or stdin
# path for the key password (verified against the installed CLI: --ci with the
# TAURI_SIGNING_PRIVATE_KEY_PASSWORD env set silently produces a PASSWORDLESS
# key, and the interactive prompt requires a real TTY). So the password must go
# on the command line via --password, where it is briefly visible to other
# local users through `ps` for the lifetime of this one call. On a shared host
# prefer --random. `pnpm --silent` still suppresses pnpm's own command echo so
# the password does not land in this script's output/logs.
#
# Generate under umask 077 so the freshly written *.key is never even briefly
# group/world-readable before the chmod below.
if [ "$FORCE" -eq 1 ]; then
  ( umask 077; pnpm --silent tauri signer generate -w "$KEY_PATH" --password "$PASSWORD" --force --ci )
else
  ( umask 077; pnpm --silent tauri signer generate -w "$KEY_PATH" --password "$PASSWORD" --ci )
fi

[ -f "$PUB_PATH" ] || die "expected public key not produced: $PUB_PATH"
# Tighten the private key file down to owner-only (belt-and-suspenders with the
# umask above, in case a --force overwrite reused a looser existing mode).
chmod 600 "$KEY_PATH" 2>/dev/null || true

# ------------------------------------------------ wire pubkey into config
info "Writing public key into $CONF_PATH (plugins.updater.pubkey)"
node -e '
const fs = require("fs");
const [confPath, pubPath] = process.argv.slice(1);
const pub = fs.readFileSync(pubPath, "utf8").trim();
const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
conf.plugins = conf.plugins || {};
conf.plugins.updater = conf.plugins.updater || {};
conf.plugins.updater.pubkey = pub;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
' "$CONF_PATH" "$PUB_PATH"

# ---------------------------------------------------------- push secrets
if [ "$SET_SECRETS" -eq 1 ]; then
  info "Setting GitHub Actions secrets on $REPO"
  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "$REPO" < "$KEY_PATH"
  printf '%s' "$PASSWORD" | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "$REPO"
  info "Secrets set: TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
fi

# ------------------------------------------------------------- backup note
cat >&2 <<EOF

============================================================================
  BACK UP THIS KEY NOW — losing it is UNRECOVERABLE.
============================================================================
  Private key : $KEY_PATH
  Public key  : $PUB_PATH$( [ "$RANDOM_PW" -eq 1 ] && printf '\n  Password    : %s' "$PW_PATH" )

  The private key + its password sign every updater artifact. If you lose
  them, you can NEVER ship an update that already-installed copies of the app
  will trust — every user would have to reinstall from scratch. Store both in
  a password manager / secret vault, off this machine.
EOF

if [ "$SET_SECRETS" -ne 1 ]; then
  cat >&2 <<EOF

  Next, store them as GitHub Actions secrets (required for CI to sign builds):
    gh secret set TAURI_SIGNING_PRIVATE_KEY${REPO:+ --repo $REPO} < "$KEY_PATH"
    gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD${REPO:+ --repo $REPO}
  (or re-run this script with --set-secrets [--repo owner/repo])
EOF
fi
printf '============================================================================\n' >&2

info ""
info "Done. Public key wired into tauri.conf.json — review & commit that change."
