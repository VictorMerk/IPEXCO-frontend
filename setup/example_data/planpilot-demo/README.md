# PlanPilot demo

The small example is suitable for showing the graph and facet selection:

- `domain-planpilot-towers.pddl`
- `problem-planpilot-towers-4.pddl`

Recommended settings:

- bounded encoding
- horizon 10
- flexible steps disabled

When the local Docker stack is running,
`setup/planpilot-local/setup-demo.mjs` creates the matching domain and project
through the IPEXCO API.

The `large-8` domain and problem contain eight blocks and are useful for
testing larger plan spaces.
