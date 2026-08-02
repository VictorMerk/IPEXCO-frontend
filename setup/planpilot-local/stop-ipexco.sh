#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
COMPOSE_PROJECT_NAME="${IPEXCO_COMPOSE_PROJECT_NAME:-ipexco-planpilot-local}"

usage() {
  cat <<'EOF'
Usage: ./stop-ipexco.sh [--delete-data]

Stops the local IPEXCO + PlanPilot stack created by start-ipexco.sh.

  --delete-data  Also remove local users, projects and PlanPilot session data.
EOF
}

DELETE_DATA=0
for arg in "$@"; do
  case "$arg" in
    --delete-data)
      DELETE_DATA=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing required command: docker" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is not available. Install the Docker Compose plugin first." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable." >&2
  exit 1
fi

FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_DIR="${IPEXCO_WORKSPACE_DIR:-$(cd "$FRONTEND_DIR/.." && pwd)}"
export IPEXCO_FRONTEND_DIR="$FRONTEND_DIR"
export IPEXCO_BACKEND_DIR="${IPEXCO_BACKEND_DIR:-$WORKSPACE_DIR/IPEXCO-backend}"
export PLANPILOT_SERVICE_DIR="${PLANPILOT_SERVICE_DIR:-$WORKSPACE_DIR/planpilot-service}"
IPEXCO_HOST_UID="${IPEXCO_HOST_UID:-$(id -u)}"
IPEXCO_HOST_GID="${IPEXCO_HOST_GID:-$(id -g)}"
export IPEXCO_HOST_UID IPEXCO_HOST_GID

docker compose --project-name "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" --profile planpilot down --remove-orphans

if (( DELETE_DATA )); then
  RUNTIME_DIR="$SCRIPT_DIR/.runtime"
  if [[ -d "$RUNTIME_DIR/ipexco-mongo" ]]; then
    docker compose --project-name "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" \
      run --rm --no-deps --user 0:0 --entrypoint /bin/sh mongo \
      -c 'find /data/db -mindepth 1 -delete'
  fi
  rm -rf -- "$RUNTIME_DIR"
  docker compose --project-name "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" \
    --profile planpilot down --remove-orphans >/dev/null
  echo "Local IPEXCO data removed."
fi

echo
docker compose --project-name "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" --profile planpilot ps
echo "IPEXCO stopped."
