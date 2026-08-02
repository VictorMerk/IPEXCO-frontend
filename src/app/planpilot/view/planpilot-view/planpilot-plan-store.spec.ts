import {
  buildPlanPage,
  cachedPlanNumbers,
  knownPlanLowerBound,
  mergePlanLoadResults,
  nextPlanBatch,
  planPageStartFor,
  PlanPilotSolutionCache,
} from "./planpilot-plan-store";
import { PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot plan store", () => {
  const facet = (id: string): PlanPilotUiFacet => ({
    id,
    label: id,
    detail: id,
    timestep: 1,
    action: id,
    group: "Actions",
    selection: "neutral",
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    tokens: [id],
  });

  it("normalizes pages and clamps the final page", () => {
    expect(buildPlanPage(7, 5, true, 12)).toEqual({
      start: 6,
      numbers: [6, 7, 8, 9, 10],
    });
    expect(buildPlanPage(30, 5, true, 12)).toEqual({
      start: 11,
      numbers: [11, 12],
    });
    expect(planPageStartFor(20, 5)).toBe(16);
  });

  it("finds the first missing batch without assuming a total", () => {
    const cache: PlanPilotSolutionCache = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        index + 1,
        { label: `plan ${index + 1}`, facets: [facet(`a-${index}`)] },
      ]),
    );

    expect(nextPlanBatch(cache, 20, false, 0)).toEqual({
      start: 21,
      end: 40,
      hasMore: true,
    });
    expect(nextPlanBatch(cache, 20, true, 25)).toEqual({
      start: 21,
      end: 25,
      hasMore: true,
    });
  });

  it("tracks cached numbers and the known lower bound", () => {
    const cache = {
      20: { label: "plan 20", facets: [facet("a")] },
      3: { label: "plan 3", facets: [facet("b")] },
    };

    expect(cachedPlanNumbers(cache)).toEqual([3, 20]);
    expect(knownPlanLowerBound(cache, 7, true)).toBe(20);
  });

  it("merges successful results and reports only real errors", () => {
    const sourceFacet = facet("new");
    const merged = mergePlanLoadResults(
      { 1: { label: "plan 1", facets: [facet("old")] } },
      [
        {
          number: 2,
          plan: { number: 2, label: "plan 2", facets: [sourceFacet] },
        },
        { number: 3, unavailable: true },
        { number: 4, error: new Error("failed") },
      ],
      (error) => (error as Error).message,
    );

    expect(Object.keys(merged.cache).map(Number)).toEqual([1, 2]);
    expect(merged.errors).toEqual(["Plan 4: failed"]);
    expect(merged.cache[2].facets[0]).not.toBe(sourceFacet);
  });
});
