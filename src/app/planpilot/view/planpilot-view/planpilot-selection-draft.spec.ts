import {
  buildConstraintTransaction,
  discardSelectionDraft,
  stageFacetSelection,
} from "./planpilot-selection-draft";
import { FacetSelection, PlanPilotUiFacet } from "./planpilot-view.models";

describe("PlanPilot selection drafts", () => {
  const facet = (
    id: string,
    timestep: number,
    selection: FacetSelection = "neutral",
    abstractTimeStep = false,
  ): PlanPilotUiFacet => ({
    id,
    label: id,
    detail: id,
    timestep,
    action: id,
    abstractTimeStep,
    group: "Actions",
    selection,
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    facetType: selection === "neutral" ? "optional" : "selected",
    tokens: [id],
  });

  it("stages and discards a selection without mutating the input", () => {
    const original = [facet("a", 1)];
    const staged = stageFacetSelection(
      original,
      {},
      "a",
      "negative",
      new Set(),
    );

    expect(original[0].selection).toBe("neutral");
    expect(staged.facets[0].selection).toBe("negative");
    expect(staged.pendingSelections["a"].previousSelection).toBe("neutral");
    expect(
      discardSelectionDraft(staged.facets, staged.pendingSelections)[0]
        .selection,
    ).toBe("neutral");
  });

  it("keeps only one required concrete action at a timestep", () => {
    const original = [facet("first", 2, "positive"), facet("second", 2)];
    const staged = stageFacetSelection(
      original,
      {},
      "second",
      "positive",
      new Set(["first"]),
    );

    expect(staged.facets.map((item) => item.selection)).toEqual([
      "neutral",
      "positive",
    ]);
    expect(staged.pendingSelections["first"]).toEqual(
      jasmine.objectContaining({
        selection: "neutral",
        previousSelection: "positive",
      }),
    );
  });

  it("does not treat flexible actions as timestep conflicts", () => {
    const staged = stageFacetSelection(
      [facet("first", 2, "positive", true), facet("second", 2)],
      {},
      "second",
      "positive",
      new Set(["first"]),
    );

    expect(staged.facets.map((item) => item.selection)).toEqual([
      "positive",
      "positive",
    ]);
  });

  it("builds the history label and changes from one draft", () => {
    const transaction = buildConstraintTransaction([
      {
        facetId: "a",
        label: "stack a b",
        timestep: 3,
        selection: "positive",
        previousSelection: "neutral",
      },
    ]);

    expect(transaction.label).toBe("Require stack a b");
    expect(transaction.changes).toEqual([
      {
        facetId: "a",
        label: "stack a b",
        timestep: 3,
        from: "neutral",
        to: "positive",
      },
    ]);
  });
});
