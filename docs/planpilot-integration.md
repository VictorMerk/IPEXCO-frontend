# PlanPilot in IPEXCO

## Goal

The integration makes PlanPilot available as another planning service inside
an IPEXCO project. A user can inspect the available facets, require or forbid
facets and browse the remaining plans. Facet Navigation offers the compact
decision workflow; the Graph view adds plan paths, alternatives, counts,
impact previews and plan comparison.

## Architecture

```text
Browser
  |  IPEXCO login and project id
  v
IPEXCO back-end
  |  project access, service choice, run metadata
  v
PlanPilot service
  |  session process and facet/query commands
  v
Fast Downward + FASB
```

PlanPilot runs as a separate service because its solver process is stateful and
can be expensive to prepare. Keeping it outside the IPEXCO back-end isolates
the native solver dependencies and lets the service enforce its own session,
capacity and timeout limits.

The IPEXCO back-end remains the public API for the browser. It verifies that
the authenticated user owns the project and run, selects the single PlanPilot
service configured for that project and stores the external session id with
the run metadata. The service API key is never sent to the browser.

## Session lifecycle

1. A view asks the back-end to start a run for the current project and
   configuration.
2. The back-end converts the stored planning task to PDDL and creates a
   PlanPilot session.
3. The service returns the representative plan, facets, minimum horizon and an
   expiry time.
4. Select, apply and query requests go through the back-end to that external
   session.
5. Leaving a view, pressing Stop, deleting a project or reaching the expiry
   time cleans up the corresponding run and solver process.

Facet Navigation and Graph use the same project data and API contract, but
each view starts and manages its own run. This prevents a decision in one open
view from unexpectedly changing the other view.

Every applied selection increments `selectionRevision`. A request may include
`expectedSelectionRevision`; stale requests receive `409 SELECTION_CONFLICT`
instead of overwriting a newer choice.

## Plan-space settings

- `exact` uses exactly the selected plan length.
- `bounded` includes plans up to the selected horizon.
- A horizon below the shortest plan is promoted to the minimum returned by the
  planner.
- Flexible steps remove a fixed timestep from eligible action facets.
- State facets add facts that hold at a timestep to the available choices.

Short operations use synchronous queries. Counting, loading plan batches and
impact previews can run as cancellable jobs because they may take longer. The
service permits one active job per session and keeps a small completed-job
history.

## Fresh-clone demo

Clone the three repositories next to each other as described in
[`setup/planpilot-local/README.md`](../setup/planpilot-local/README.md), then
run:

```bash
cd IPEXCO-frontend/setup/planpilot-local
./start-ipexco.sh --demo
```

The demo option is idempotent. It creates or reuses the local demo user, four
service registrations, the PlanPilot Towers domain and its project. The same
setup can be run later with `node setup-demo.mjs`. It prints the credentials
and links for both views. Suggested Graph settings are `bounded`, horizon `10`.

From the normal interface, log in as `planpilot-demo`, open the PlanPilot
Towers project and choose PlanPilot. This opens Facet Navigation. Use
**Open graph** on that page for the Graph view. The printed links skip these
navigation steps when a demo needs to start quickly.

## Checks

The repositories use these focused checks:

```bash
# Front-end unit tests and build
cd IPEXCO-frontend
npm ci
npm run test:planpilot
npm run build

# Back-end PlanPilot tests and build
cd ../IPEXCO-backend
npm ci
npm run test:planpilot

# Service API and unit tests
cd ../planpilot-service
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q tests lib/planpilot/translate/tests
```

With the Docker stack and demo running, the optional end-to-end checks are:

```bash
node verify-service-matrix.mjs
IPEXCO_UI_TOKEN=<token> IPEXCO_PROJECT_ID=<id> node smoke-navigation-ui.mjs
IPEXCO_UI_TOKEN=<token> IPEXCO_PROJECT_ID=<id> node smoke-ui.mjs
```

The browser checks require Node.js 22 and Google Chrome. `setup-demo.mjs`
prints the project id; the token is deliberately not printed or stored.

## Known limits

- Counting a large bounded plan space may hit the selected operation timeout.
  The current graph remains usable and the job can be cancelled.
- The local Compose files contain demo credentials and are not a public
  deployment configuration.
- The included FASB binary targets Linux x86_64. ARM hosts use Docker
  emulation and run more slowly.
- Facets in the displayed representative plan are not automatically fixed
  constraints. A plan facet can only be selected when FASB reports it as
  selectable.

## Third-party components

IPEXCO is the host application. PlanPilot, Fast Downward and FASB are upstream
components bundled by the PlanPilot service. Their repositories, revisions and
licences are listed in the service repository's `THIRD_PARTY.md`.
