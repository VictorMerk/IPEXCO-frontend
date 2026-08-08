# Local PlanPilot setup

This Docker Compose setup runs IPEXCO together with PlanPilot, MongoDB and the
other planning services. It is intended for local development and demos.

## Requirements

- Docker with the Docker Compose plugin
- Git
- Bash (use a WSL shell on Windows)

Docker Desktop must be running when using WSL. Clone the repositories inside
the WSL filesystem, for example below `~/planpilot-workspace`, rather than below
`/mnt/c`.

## Clone

The three repositories should be in the same folder:

```text
planpilot-workspace/
  IPEXCO-frontend/
  IPEXCO-backend/
  planpilot-service/
```

```bash
mkdir planpilot-workspace
cd planpilot-workspace

git clone --branch dev https://github.com/VictorMerk/IPEXCO-frontend.git
git clone --branch dev --recurse-submodules https://github.com/VictorMerk/IPEXCO-backend.git
git clone --branch master https://github.com/VictorMerk/planpilot-service.git
```

If the backend was cloned without its submodule:

```bash
git -C IPEXCO-backend submodule update --init --recursive
```

## Start with Docker Compose

```bash
cd IPEXCO-frontend/setup/planpilot-local

IPEXCO_HOST_UID="$(id -u)" \
IPEXCO_HOST_GID="$(id -g)" \
docker compose --profile planpilot up -d --build
```

The included script runs the same Compose stack and additionally checks the
required folders, ports and service readiness:

```bash
./start-ipexco.sh
```

Open `http://localhost:4200` after the containers are ready.

## Stop

```bash
docker compose --profile planpilot down --remove-orphans
```

The equivalent helper is:

```bash
./stop-ipexco.sh
```

User and project data remain in `.runtime` after a normal stop.

To stop the stack and remove all local users and projects:

```bash
./stop-ipexco.sh --delete-data
```

## Register services in IPEXCO

The backend runs inside Docker, so use the Compose service names instead of
`localhost`:

| Service          | Type               | URL                            | API key               | Encoding       |
| ---------------- | ------------------ | ------------------------------ | --------------------- | -------------- |
| PlanPilot        | `PLANPILOT`        | `http://planpilot:5000`        | `ipexco-demo-api-key` | `PDDL_CLASSIC` |
| Planner          | `PLANNER`          | `http://planner-fd:3333`       | `ipexco-demo-api-key` | `PDDL_CLASSIC` |
| Explainer        | `EXPLAINER`        | `http://explainer:3334`        | `ipexco-demo-api-key` | `PDDL_CLASSIC` |
| Property checker | `PROPERTY_CHECKER` | `http://property-checker:3335` | `ipexco-demo-api-key` | `PDDL_CLASSIC` |

Register the services before creating a project so they are selected
automatically. For an existing project, select newly registered services in
the project settings.

PlanPilot health is available from the host at
`http://localhost:5000/api/health`.

## Common problems

- Ports `3000`, `3333`, `3334`, `3335`, `4200`, `5000` and `27017` must be
  free. `docker compose ls` shows other Compose stacks and `docker ps` shows
  standalone containers.
- A login token from an older local database may be invalid. Clear
  `jwt-token` from the browser's local storage and register again.
- After pulling changes, run `./start-ipexco.sh` with its default build mode.
  `--no-build` keeps the previously built images.
- PlanPilot contains an x86_64 FASB binary. Docker uses amd64 emulation on
  Apple Silicon, which is slower.

The local configuration uses demo keys and open registration. Do not use it as
a public deployment without changing the configuration.
