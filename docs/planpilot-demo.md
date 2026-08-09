# PlanPilot demo

This guide starts the complete IPEXCO and PlanPilot demo from a fresh clone.
The setup creates the example data automatically, so no services, domain files
or projects have to be entered by hand.

## Requirements

- Docker with the Docker Compose plugin
- Git
- Bash
- `curl`
- Node.js 22

On Windows, use a WSL shell and make sure Docker Desktop is running. Clone the
repositories inside the WSL filesystem, for example below
`~/planpilot-workspace`, instead of below `/mnt/c`.

## Clone and start

```bash
mkdir planpilot-workspace
cd planpilot-workspace

git clone --branch dev https://github.com/VictorMerk/IPEXCO-frontend.git
git clone --branch dev --recurse-submodules https://github.com/VictorMerk/IPEXCO-backend.git
git clone --branch master https://github.com/VictorMerk/planpilot-service.git

cd IPEXCO-frontend
./start-ipexco.sh --demo
```

The first start downloads the external service images and builds the three
local repositories. Later starts reuse the local data but rebuild the local
images so that pulled changes are included.

The demo setup creates or reuses:

- the user `planpilot-demo` with password `planpilot-demo`
- PlanPilot, planner, explainer and property-checker registrations
- the PlanPilot Towers domain
- a project containing the demo domain and problem

The command prints the project URL and direct links to Facet Navigation and
Graph when all services are ready.

## Demo route

1. Open `http://localhost:4200` and log in.
2. Open the **PlanPilot Towers** project.
3. Select **PlanPilot** on the project page.
4. Facet Navigation opens first. Require or forbid a facet and inspect the
   remaining plans.
5. Use **Open graph** to switch to the Graph view.
6. Use bounded encoding and horizon 10 for the prepared example.
7. Inspect a plan path, alternatives and the plan comparison.
8. Stop the active PlanPilot run before leaving the demo.

The setup command is idempotent and can be run again without creating duplicate
users, services or projects.

## Stop and restart

Run the helper from `IPEXCO-frontend`:

```bash
./stop-ipexco.sh
```

This keeps users and projects. Start the same demo again with:

```bash
./start-ipexco.sh --demo
```

To delete the local demo database as well:

```bash
./stop-ipexco.sh --delete-data
```

## More details

- [Docker settings, service addresses and troubleshooting](../setup/planpilot-local/README.md)
- [Architecture, sessions and plan-space settings](planpilot-integration.md)
- [Implemented project contributions](../PLANPILOT_CONTRIBUTIONS.md)
