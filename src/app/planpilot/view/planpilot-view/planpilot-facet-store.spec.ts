import { PlanPilotFacet } from "../../service/planpilot.service";
import { buildFacetSnapshot } from "./planpilot-facet-store";
import { PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot facet store", () => {
  const backendFacet = (id: string, timestep: number): PlanPilotFacet => ({
    id,
    label: id,
    timestep,
    selectionState: "neutral",
    facetType: "optional",
  });
  const pinnedFacet = (id: string): PlanPilotUiFacet => ({
    id,
    label: id,
    detail: id,
    timestep: 2,
    action: id,
    group: "Required by you",
    selection: "positive",
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    facetType: "selected",
    tokens: [id],
  });

  it("maps action facets, removes state facets, and adds the session root", () => {
    const snapshot = buildFacetSnapshot({
      backendFacets: [
        backendFacet("occurs(action((a)),1)", 1),
        backendFacet("holds(clear(a),1)", 1),
      ],
      previousFacets: [],
      activePinnedFacets: {},
      knownFacets: {},
      remainingSolutions: 12,
      summarizeChange: false,
    });

    expect(snapshot.facets.map((facet) => facet.id)).toEqual([
      "__session__",
      "occurs(action((a)),1)",
    ]);
    expect(snapshot.facets[0].remainingSolutions).toBe(12);
  });

  it("keeps a selected facet visible when it leaves the open space", () => {
    const pinned = pinnedFacet("selected");
    const snapshot = buildFacetSnapshot({
      backendFacets: [backendFacet("open", 1)],
      previousFacets: [pinned, pinnedFacet("removed")],
      activePinnedFacets: { selected: pinned },
      knownFacets: {},
      remainingSolutions: null,
      inspectedFacetId: "selected",
      summarizeChange: true,
    });

    expect(snapshot.facets.find((facet) => facet.id === "selected")).toEqual(
      jasmine.objectContaining({ available: false, parentId: undefined }),
    );
    expect(snapshot.inspectedFacetId).toBe("selected");
    expect(snapshot.spaceChangeSummary).toBe(
      "1 actions entered the current space · 2 left it",
    );
  });

  it("clears inspection and explains an empty resulting space", () => {
    const snapshot = buildFacetSnapshot({
      backendFacets: [],
      previousFacets: [pinnedFacet("old")],
      activePinnedFacets: {},
      knownFacets: {},
      remainingSolutions: 0,
      inspectedFacetId: "old",
      summarizeChange: true,
    });

    expect(snapshot.inspectedFacetId).toBeUndefined();
    expect(snapshot.spaceChangeSummary).toBe(
      "Current space is empty for this selection.",
    );
  });

  it("explains an empty space even when no earlier facets were loaded", () => {
    const snapshot = buildFacetSnapshot({
      backendFacets: [],
      previousFacets: [],
      activePinnedFacets: {},
      knownFacets: {},
      remainingSolutions: 0,
      summarizeChange: true,
    });

    expect(snapshot.spaceChangeSummary).toBe(
      "Current space is empty for this selection.",
    );
  });
});
