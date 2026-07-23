#!/usr/bin/env bash

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    return 1
  }
}

require_dir() {
  [[ -d "$1" ]] || {
    echo "Missing required directory: $1" >&2
    echo "Clone the three repositories next to each other or set the path overrides from --help." >&2
    return 1
  }
}

require_file() {
  [[ -f "$1" ]] || {
    echo "Missing required file: $1" >&2
    return 1
  }
}

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

wait_for_port() {
  local name="$1" host="$2" port="$3" timeout_seconds="${4:-120}"
  local deadline=$((SECONDS + timeout_seconds))
  printf 'Waiting for %s on %s:%s' "$name" "$host" "$port"
  while (( SECONDS < deadline )); do
    if curl --silent --output /dev/null --max-time 3 "http://$host:$port/"; then
      printf ' ok\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf ' failed\n'
  return 1
}

wait_for_http() {
  local name="$1" url="$2" timeout_seconds="${3:-120}"
  local deadline=$((SECONDS + timeout_seconds))
  printf 'Waiting for %s at %s' "$name" "$url"
  while (( SECONDS < deadline )); do
    if curl --fail --silent --max-time 3 "$url" >/dev/null; then
      printf ' ok\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf ' failed\n'
  return 1
}

wait_for_mongo() {
  local deadline=$((SECONDS + ${1:-120}))
  printf 'Waiting for MongoDB ping'
  while (( SECONDS < deadline )); do
    if compose exec -T mongo mongosh --quiet \
      --eval 'quit(db.adminCommand({ping: 1}).ok === 1 ? 0 : 1)' admin >/dev/null 2>&1; then
      printf ' ok\n'
      return 0
    fi
    printf '.'
    sleep 2
  done
  printf ' failed\n'
  return 1
}
