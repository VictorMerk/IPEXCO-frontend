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

check_compose_project_owner() {
  local current_file existing_files existing_file
  current_file="$(realpath "$COMPOSE_FILE")"
  existing_files="$(
    docker ps -a \
      --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
      --format '{{.Label "com.docker.compose.project.config_files"}}' |
      sed '/^$/d' |
      sort -u
  )"

  [[ -z "$existing_files" ]] && return 0

  while IFS= read -r existing_file; do
    [[ "$existing_file" == "$current_file" ]] && return 0
  done <<< "$existing_files"

  echo "A Compose stack named '$COMPOSE_PROJECT_NAME' already belongs to another checkout:" >&2
  printf '  %s\n' "$existing_files" >&2
  echo "Stop that stack from its checkout before starting this one." >&2
  echo "You can also use a different IPEXCO_COMPOSE_PROJECT_NAME, but the default ports must still be free." >&2
  return 1
}

check_docker_port_conflicts() {
  local failed=0 port holders

  for port in 27017 3000 3333 3334 3335 4200 5000; do
    holders="$(
      docker ps \
        --filter "publish=$port" \
        --format '{{.Names}}|{{.Label "com.docker.compose.project"}}'
    )"
    [[ -z "$holders" ]] && continue

    while IFS='|' read -r name project; do
      [[ "$project" == "$COMPOSE_PROJECT_NAME" ]] && continue
      echo "Port $port is already used by Docker container '$name'${project:+ (Compose project '$project')}." >&2
      failed=1
    done <<< "$holders"
  done

  if (( failed )); then
    echo "Stop only the conflicting stack, then run the launcher again." >&2
    echo "Inspect running stacks with: docker compose ls" >&2
    return 1
  fi
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
