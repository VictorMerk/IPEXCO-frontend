import {
  isSelectableFacet,
  PlanPilotFacetZ,
  PlanPilotSelectionState,
} from "./planpilot";

describe("PlanPilot navigation facets", () => {
  const facet = {
    id: 'occurs(action(("stack","b","a")),4)',
    label: "stack b a",
    timestep: 4,
    selectionState: PlanPilotSelectionState.NEUTRAL,
  };

  it("keeps the service availability metadata", () => {
    const parsed = PlanPilotFacetZ.parse({
      ...facet,
      selectable: false,
      facetType: "plan",
    });

    expect(parsed.selectable).toBeFalse();
    expect(parsed.facetType).toBe("plan");
    expect(isSelectableFacet(parsed)).toBeFalse();
  });

  it("accepts facets from older services without availability metadata", () => {
    expect(isSelectableFacet(PlanPilotFacetZ.parse(facet))).toBeTrue();
  });
});
