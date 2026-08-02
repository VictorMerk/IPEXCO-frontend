# PlanPilot integration

The PlanPilot integration was developed during the IPEXCO student project.

## Structure

```text
IPEXCO front-end
      |
IPEXCO back-end
      |
PlanPilot service
      |
Fast Downward + FASB
```

The back-end owns project access and service registration. The PlanPilot
service prepares the planning task and keeps the facet session. The front-end
provides two views for the same session:

- Facet Navigation
- Graph and plan exploration

## Contributions

- Victor Merk worked mainly on the graph, sidebar, plan exploration, local
  Docker setup and the session/query integration across the three repositories.
- Dionyssis Antypas worked mainly on Facet Navigation and its integration into
  the PlanPilot project flow.
- Contract alignment, merging and final verification were shared project work.

AI-assisted coding was used during parts of the graph implementation,
refactoring and debugging. The resulting behavior was reviewed against the
service contracts and checked with local builds, tests and browser runs.

## Current limits

- The Docker Compose setup is intended for local development and demos.
- Exact counting can take longer for large plan spaces.
- The bundled FASB executable requires an x86_64 Linux environment or Docker
  emulation.
