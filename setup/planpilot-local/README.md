# Local PlanPilot setup

This Docker Compose setup runs IPEXCO together with PlanPilot, MongoDB and the
other planning services. This page documents the Compose setup itself. For the
short fresh-clone walkthrough, use the
[PlanPilot demo guide](../../docs/planpilot-demo.md).

The directory is named `planpilot-local` because it uses demo credentials,
host-only ports and locally built source code. Normal users can start and stop
the stack with the helper scripts in the front-end root and do not need to work
in this directory.

## Requirements

- Docker with the Docker Compose plugin
- Git
- Bash (use a WSL shell on Windows)
- `curl`
- Node.js 22 when using `--demo`

Docker Desktop must be running when using WSL. Clone the repositories inside
the WSL filesystem, for example below `~/planpilot-workspace`, rather than below
`/mnt/c`.

## Folder layout

The three repositories should be in the same folder:

```text
planpilot-workspace/
  IPEXCO-frontend/
  IPEXCO-backend/
  planpilot-service/
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

The root-level helper runs the same Compose stack and additionally checks the
required folders, ports and service readiness:

```bash
cd IPEXCO-frontend
./start-ipexco.sh
```

For a fresh demo setup, one command also prepares the example user, services
and project:

```bash
./start-ipexco.sh --demo
```

Open `http://localhost:4200` after the containers are ready.

## Prepare the demo project

After the stack is ready, the optional setup command creates or reuses a local
demo user, the four service registrations and a PlanPilot Towers project:

```bash
node setup/planpilot-local/setup-demo.mjs
```

It is safe to run the command again. The result includes the login and direct
links to Facet Navigation and Graph. Environment variables
`IPEXCO_DEMO_USER`, `IPEXCO_DEMO_PASSWORD`, `IPEXCO_API_URL` and
`IPEXCO_UI_URL` can override the local defaults.

## Stop

From the front-end root, use:

```bash
./stop-ipexco.sh
```

The corresponding direct Compose command in this directory is:

```bash
docker compose --profile planpilot down --remove-orphans
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

The normal demo route is in the
[PlanPilot demo guide](../../docs/planpilot-demo.md). The integration design,
session lifecycle, test commands and known limits are summarized in the
[integration notes](../../docs/planpilot-integration.md).
