import { buildPlanPilotGraphView } from "./planpilot-graph-view";
import { PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot graph view", () => {
  it("keeps the displayed path and comparison nodes when the graph is limited", () => {
    const displayed = facet("displayed", 1, {
      solutionContext: true,
      parentId: "root",
    });
    const result = buildPlanPilotGraphView({
      facets: [
        facet("root", -1, { nodeType: "root" }),
        facet("displayed", 1),
        facet("alternative-1", 1),
        facet("alternative-2", 2),
      ],
      displayedPlan: [displayed],
      inspectedFacetId: undefined,
      limit: 3,
      comparisonActive: true,
      comparisonStates: { compared: "only-b" },
      comparisonPlans: {
        a: [],
        b: [facet("compared", 2)],
      },
      compare: (left, right) => left.timestep - right.timestep,
    });

    expect(result.map((item) => item.id)).toContain("root");
    expect(result.map((item) => item.id)).toContain("displayed");
    expect(result.map((item) => item.id)).toContain("compared");
    expect(result.find((item) => item.id === "displayed")?.parentId).toBe(
      "root",
    );
  });
});

function facet(
  id: string,
  timestep: number,
  overrides: Partial<PlanPilotUiFacet> = {},
): PlanPilotUiFacet {
  return {
    id,
    label: id,
    detail: id,
    timestep,
    action: id,
    group: "Actions",
    selection: "neutral",
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    tokens: [id],
    ...overrides,
  };
}
