import {
  buildGoalFacet,
  decorateGraphFacet,
  facetStateLabel,
  isDisplayedPlanFacet,
  isForbiddenFacet,
  isRequiredFacet,
  isUserConstraint,
  PlanPilotFacetPresentationContext,
} from "./planpilot-facet-presentation";
import { PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot facet presentation", () => {
  const facet = (
    overrides: Partial<PlanPilotUiFacet> = {},
  ): PlanPilotUiFacet => ({
    id: "move-a-b@2",
    label: "move a b",
    detail: "move a b",
    timestep: 2,
    action: "move",
    group: "Actions",
    selection: "neutral",
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    tokens: ["move", "a", "b"],
    ...overrides,
  });
  const context = (
    overrides: Partial<PlanPilotFacetPresentationContext> = {},
  ): PlanPilotFacetPresentationContext => ({
    displayedPlanIds: new Set(),
    activePinnedFacetIds: new Set(),
    pendingSelections: {},
    solutionCount: null,
    ...overrides,
  });

  it("keeps displayed-plan membership separate from user constraints", () => {
    const displayed = facet();
    const state = context({
      displayedPlanIds: new Set([displayed.id]),
    });

    expect(isDisplayedPlanFacet(displayed, state)).toBeTrue();
    expect(isUserConstraint(displayed, state)).toBeFalse();
    expect(isRequiredFacet(displayed, state)).toBeFalse();
    expect(facetStateLabel(displayed, state)).toBe(
      "Displayed plan · No constraint",
    );
  });

  it("recognizes pending and active require/forbid states", () => {
    const required = facet({
      selection: "positive",
      facetType: "selected",
    });
    const forbidden = facet({
      id: "drop-a@3",
      selection: "negative",
    });
    const state = context({
      activePinnedFacetIds: new Set([required.id]),
      pendingSelections: {
        [forbidden.id]: {
          facetId: forbidden.id,
          label: forbidden.label,
          timestep: forbidden.timestep,
          selection: "negative",
          previousSelection: "neutral",
        },
      },
    });

    expect(isRequiredFacet(required, state)).toBeTrue();
    expect(isForbiddenFacet(forbidden, state)).toBeTrue();
    expect(facetStateLabel(required, state)).toBe("Required by you");
    expect(facetStateLabel(forbidden, state)).toBe("Forbid pending");
  });

  it("decorates graph nodes using one consistent state model", () => {
    const required = facet({
      selection: "positive",
      facetType: "selected",
    });
    const decorated = decorateGraphFacet(
      required,
      context({
        activePinnedFacetIds: new Set([required.id]),
        solutionCount: 4,
      }),
    );
    const root = decorateGraphFacet(
      facet({ id: "__session__", nodeType: "root" }),
      context({ solutionCount: 4 }),
    );

    expect(decorated.visualState).toBe("required");
    expect(decorated.userConstraint).toBeTrue();
    expect(decorated.meta).toBe("required by you · t2");
    expect(root.visualState).toBe("root");
    expect(root.meta).toBe("4 valid plans");
  });

  it("builds a goal directly after the last displayed action", () => {
    const goal = buildGoalFacet(facet({ id: "last", timestep: 7 }), 3);

    expect(goal).toEqual(
      jasmine.objectContaining({
        id: "__goal__",
        timestep: 8,
        parentId: "last",
        remainingSolutions: 3,
      }),
    );
  });
});
