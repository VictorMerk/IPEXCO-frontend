import { planPilotFacetAvailabilityReason } from "./planpilot-facet-availability";
import { PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot facet availability", () => {
  it("explains a timestep conflict using the required action", () => {
    const unavailable = facet("move-b", 2, { available: false });
    const required = facet("move-a", 2, {
      selection: "positive",
      facetType: "selected",
    });

    expect(
      planPilotFacetAvailabilityReason(unavailable, [required], {}),
    ).toBe("move-a is required at the same timestep.");
  });

  it("uses solver relationship metadata for fixed actions", () => {
    const fixed = facet("finish", 3, {
      facetType: "implied",
      selectable: false,
      impliedBy: ["prepare"],
    });

    expect(
      planPilotFacetAvailabilityReason(fixed, [], {
        prepare: facet("prepare blocks", 2),
      }),
    ).toBe("Fixed by prepare blocks.");
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
