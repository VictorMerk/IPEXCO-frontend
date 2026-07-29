import { withFacetSelectionState } from "./planpilot-solution";
import {
  FacetSelection,
  PendingFacetSelection,
  PlanPilotConstraintChange,
  PlanPilotConstraintTransaction,
  PlanPilotUiFacet,
} from "./planpilot-view.models";

export interface PlanPilotSelectionDraft {
  facets: PlanPilotUiFacet[];
  pendingSelections: Record<string, PendingFacetSelection>;
}

export function stageFacetSelection(
  facets: PlanPilotUiFacet[],
  pendingSelections: Record<string, PendingFacetSelection>,
  facetId: string,
  targetSelection: FacetSelection,
  userConstraintIds: ReadonlySet<string>,
): PlanPilotSelectionDraft {
  const facet = facets.find((candidate) => candidate.id === facetId);
  if (!facet) {
    return { facets, pendingSelections };
  }

  const nextPending = { ...pendingSelections };
  let nextFacets = facets;
  if (targetSelection === "positive") {
    nextFacets = clearConcreteTimestepConflict(
      facets,
      facet,
      nextPending,
      userConstraintIds,
    );
  }

  const committedSelection =
    nextPending[facetId]?.previousSelection ?? facet.selection;
  if (targetSelection === committedSelection) {
    delete nextPending[facetId];
  } else {
    nextPending[facetId] = {
      facetId,
      label: facet.label,
      timestep: facet.timestep,
      selection: targetSelection,
      previousSelection: committedSelection,
    };
  }

  return {
    pendingSelections: nextPending,
    facets: nextFacets.map((candidate) =>
      candidate.id === facetId
        ? withFacetSelectionState(candidate, targetSelection)
        : candidate,
    ),
  };
}

export function discardSelectionDraft(
  facets: PlanPilotUiFacet[],
  pendingSelections: Record<string, PendingFacetSelection>,
): PlanPilotUiFacet[] {
  return facets.map((facet) => {
    const staged = pendingSelections[facet.id];
    return staged
      ? withFacetSelectionState(facet, staged.previousSelection)
      : facet;
  });
}

export function buildConstraintTransaction(
  selections: PendingFacetSelection[],
): PlanPilotConstraintTransaction {
  const changes = selections.map((selection): PlanPilotConstraintChange => ({
    facetId: selection.facetId,
    label: selection.label,
    timestep: selection.timestep,
    from: selection.previousSelection,
    to: selection.selection,
  }));
  return {
    label: constraintTransactionLabel(changes),
    changes,
  };
}

export function constraintTransactionLabel(
  changes: PlanPilotConstraintChange[],
): string {
  if (changes.length !== 1) {
    return `${changes.length} constraint changes`;
  }
  const change = changes[0];
  const operation =
    change.to === "positive"
      ? "Require"
      : change.to === "negative"
        ? "Forbid"
        : "Remove constraint from";
  return `${operation} ${change.label}`;
}

function clearConcreteTimestepConflict(
  facets: PlanPilotUiFacet[],
  selectedFacet: PlanPilotUiFacet,
  pendingSelections: Record<string, PendingFacetSelection>,
  userConstraintIds: ReadonlySet<string>,
): PlanPilotUiFacet[] {
  return facets.map((candidate) => {
    if (
      candidate.id === selectedFacet.id ||
      selectedFacet.abstractTimeStep ||
      candidate.abstractTimeStep ||
      candidate.timestep !== selectedFacet.timestep ||
      candidate.selection !== "positive" ||
      (!userConstraintIds.has(candidate.id) &&
        pendingSelections[candidate.id]?.selection !== "positive")
    ) {
      return candidate;
    }

    const pending = pendingSelections[candidate.id];
    const committedSelection =
      pending?.previousSelection ?? candidate.selection;
    if (committedSelection === "neutral") {
      delete pendingSelections[candidate.id];
    } else {
      pendingSelections[candidate.id] = {
        facetId: candidate.id,
        label: candidate.label,
        timestep: candidate.timestep,
        selection: "neutral",
        previousSelection: committedSelection,
      };
    }
    return withFacetSelectionState(candidate, "neutral");
  });
}
