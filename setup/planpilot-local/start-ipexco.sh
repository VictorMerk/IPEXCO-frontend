#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKSPACE_DIR="${IPEXCO_WORKSPACE_DIR:-$(cd "$FRONTEND_DIR/.." && pwd)}"
BACKEND_DIR="${IPEXCO_BACKEND_DIR:-$WORKSPACE_DIR/IPEXCO-backend}"
PLANPILOT_DIR="${PLANPILOT_SERVICE_DIR:-$WORKSPACE_DIR/planpilot-service}"
RUNTIME_DIR="$SCRIPT_DIR/.runtime"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
COMPOSE_PROJECT_NAME="${IPEXCO_COMPOSE_PROJECT_NAME:-ipexco-planpilot-local}"

# shellcheck source=local-stack-lib.sh
source "$SCRIPT_DIR/local-stack-lib.sh"

usage() {
  cat <<'EOF'
Usage: ./start-ipexco.sh [--build|--no-build] [--build-service SERVICE] [--with-planpilot|--without-planpilot]

Starts the local IPEXCO stack from sibling frontend, backend, and PlanPilot repositories.

  --build                    Rebuild all local images before starting (default).
  --no-build                 Use existing local images.
  --build-service SERVICE    Rebuild frontend, backend, or planpilot. Repeatable.
  --with-planpilot           Start the local PlanPilot service (default).
  --without-planpilot        Start IPEXCO without the local PlanPilot service.

Path overrides: IPEXCO_WORKSPACE_DIR, IPEXCO_BACKEND_DIR, PLANPILOT_SERVICE_DIR
Other overrides: IPEXCO_SERVICE_KEY, IPEXCO_JWT_KEY, PLANPILOT_API_KEY,
IPEXCO_DOCKER_PLATFORM, IPEXCO_COMPOSE_PROJECT_NAME
EOF
}

BUILD=1
WITH_PLANPILOT=1
PLANPILOT_MODE_EXPLICIT=0
BUILD_SERVICES=()

add_build_service() {
  local normalized
  case "$1" in
    frontend|ipexco-frontend) normalized="ipexco-frontend" ;;
    backend|ipexco-backend) normalized="ipexco-backend" ;;
    planpilot) normalized="planpilot" ;;
    *) echo "Unknown build service: $1 (expected frontend, backend, or planpilot)." >&2; exit 2 ;;
  esac
  [[ " ${BUILD_SERVICES[*]} " == *" $normalized "* ]] || BUILD_SERVICES+=("$normalized")
}

while (($#)); do
  case "$1" in
    --build) BUILD=1 ;;
    --no-build) BUILD=0 ;;
    --with-planpilot) WITH_PLANPILOT=1; PLANPILOT_MODE_EXPLICIT=1 ;;
    --without-planpilot) WITH_PLANPILOT=0; PLANPILOT_MODE_EXPLICIT=1 ;;
    --build-service=*) add_build_service "${1#*=}" ;;
    --build-service)
      shift
      (($#)) || { echo "--build-service requires a service name." >&2; exit 2; }
      add_build_service "$1"
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if (( BUILD && ${#BUILD_SERVICES[@]} > 0 )); then
  echo "--build cannot be combined with --build-service." >&2
  exit 2
fi
if [[ " ${BUILD_SERVICES[*]} " == *" planpilot "* ]]; then
  if (( PLANPILOT_MODE_EXPLICIT && ! WITH_PLANPILOT )); then
    echo "--build-service planpilot cannot be combined with --without-planpilot." >&2
    exit 2
  fi
  WITH_PLANPILOT=1
fi

require_command docker
require_command curl
require_dir "$FRONTEND_DIR"
require_dir "$BACKEND_DIR"
(( ! WITH_PLANPILOT )) || require_dir "$PLANPILOT_DIR"
require_file "$BACKEND_DIR/utils/pddl_parser/main.py" || {
  echo "Initialize backend submodules with: git -C \"$BACKEND_DIR\" submodule update --init --recursive" >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || { echo "Install the Docker Compose plugin first." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon is not reachable." >&2; exit 1; }

mkdir -p "$RUNTIME_DIR/ipexco-data" "$RUNTIME_DIR/ipexco-mongo" \
  "$RUNTIME_DIR/planpilot-data" "$RUNTIME_DIR/planpilot-temp"
export IPEXCO_FRONTEND_DIR="$FRONTEND_DIR"
export IPEXCO_BACKEND_DIR="$BACKEND_DIR"
export PLANPILOT_SERVICE_DIR="$PLANPILOT_DIR"
export IPEXCO_DOCKER_PLATFORM="${IPEXCO_DOCKER_PLATFORM:-linux/amd64}"
IPEXCO_HOST_UID="$(id -u)"
IPEXCO_HOST_GID="$(id -g)"
export IPEXCO_HOST_UID IPEXCO_HOST_GID

PROFILE_ARGS=()
if (( WITH_PLANPILOT )); then
  PROFILE_ARGS=(--profile planpilot)
else
  compose --profile planpilot rm --stop --force planpilot planpilot-init >/dev/null
fi

echo "Starting IPEXCO"
echo "Frontend: $FRONTEND_DIR"
echo "Backend:  $BACKEND_DIR"
(( ! WITH_PLANPILOT )) || echo "PlanPilot: $PLANPILOT_DIR"
echo "Platform: $IPEXCO_DOCKER_PLATFORM"
echo "Compose project: $COMPOSE_PROJECT_NAME"

if ((${#BUILD_SERVICES[@]})); then
  compose "${PROFILE_ARGS[@]}" build "${BUILD_SERVICES[@]}"
  compose "${PROFILE_ARGS[@]}" up -d --remove-orphans
elif (( BUILD )); then
  compose "${PROFILE_ARGS[@]}" up -d --build --remove-orphans
else
  compose "${PROFILE_ARGS[@]}" up -d --remove-orphans
fi

# The config is bind-mounted, so reload nginx after backend container changes.
compose exec -T ipexco-frontend nginx -t
compose exec -T ipexco-frontend nginx -s reload
compose "${PROFILE_ARGS[@]}" ps

failed=0
wait_for_mongo 120 || failed=1
wait_for_http "backend" "http://127.0.0.1:3000/api/health" 120 || failed=1
wait_for_http "frontend" "http://127.0.0.1:4200" 120 || failed=1
wait_for_port "planner" "127.0.0.1" 3333 120 || failed=1
wait_for_port "explainer" "127.0.0.1" 3334 120 || failed=1
wait_for_port "property checker" "127.0.0.1" 3335 120 || failed=1
(( ! WITH_PLANPILOT )) || wait_for_http "planpilot" "http://127.0.0.1:5000/api/ready" 120 || failed=1

if (( failed )); then
  echo "One or more services did not become reachable. Recent logs:"
  compose "${PROFILE_ARGS[@]}" logs --tail=100
  exit 1
fi

echo "IPEXCO is running:"
echo "  Frontend: http://localhost:4200"
echo "  Backend:  http://localhost:3000"
if (( WITH_PLANPILOT )); then
  echo "  PlanPilot: http://localhost:5000/api/health"
  echo "Register it in IPEXCO as http://planpilot:5000."
  if [[ -n "${PLANPILOT_API_KEY:-}" ]]; then
    echo "Use the API key supplied through PLANPILOT_API_KEY."
  else
    echo "Use the local default API key: test"
  fi
fi
