import { PlanPilotFacet } from "../../service/planpilot.service";
import { mapBackendFacet } from "./planpilot-solution";
import {
  isStructuralPlanPilotFacet,
  PlanPilotUiFacet,
} from "./planpilot-view.models";

export interface PlanPilotFacetSnapshotInput {
  backendFacets: PlanPilotFacet[];
  previousFacets: PlanPilotUiFacet[];
  activePinnedFacets: Record<string, PlanPilotUiFacet>;
  knownFacets: Record<string, PlanPilotUiFacet>;
  remainingSolutions: number | null;
  inspectedFacetId?: string;
  summarizeChange: boolean;
}

export interface PlanPilotFacetSnapshot {
  facets: PlanPilotUiFacet[];
  knownFacets: Record<string, PlanPilotUiFacet>;
  inspectedFacetId?: string;
  spaceChangeSummary?: string;
}

export function buildFacetSnapshot(
  input: PlanPilotFacetSnapshotInput,
): PlanPilotFacetSnapshot {
  const previousAvailableIds = new Set(
    input.previousFacets
      .filter((facet) => !isStructuralPlanPilotFacet(facet) && facet.available)
      .map((facet) => facet.id),
  );
  const mapped = input.backendFacets
    .filter((facet) => !isStateFacet(facet))
    .map(mapBackendFacet)
    .sort(byTimestepAndLabel);
  const pinned = Object.values(input.activePinnedFacets)
    .filter((facet) => !mapped.some((candidate) => candidate.id === facet.id))
    .map((facet) => ({
      ...facet,
      available: false,
      parentId: undefined,
    }));
  const knownFacets = {
    ...input.knownFacets,
    ...Object.fromEntries(mapped.map((facet) => [facet.id, facet])),
    ...Object.fromEntries(pinned.map((facet) => [facet.id, facet])),
  };
  const navigableFacets = [...mapped, ...pinned].sort(
    comparePlanPilotGraphOrder,
  );
  const root = sessionRoot(input.remainingSolutions, mapped.length);
  const facets = [root, ...navigableFacets];

  return {
    facets,
    knownFacets,
    inspectedFacetId: nextInspectedFacetId(
      input.inspectedFacetId,
      facets,
      navigableFacets.length > 0,
    ),
    spaceChangeSummary: input.summarizeChange
      ? describeSpaceChange(previousAvailableIds, mapped)
      : undefined,
  };
}

export function comparePlanPilotGraphOrder(
  left: PlanPilotUiFacet,
  right: PlanPilotUiFacet,
): number {
  return (
    graphOrderWeight(left) - graphOrderWeight(right) ||
    left.timestep - right.timestep ||
    left.label.localeCompare(right.label)
  );
}

function sessionRoot(
  remainingSolutions: number | null,
  remainingFacets: number,
): PlanPilotUiFacet {
  return {
    id: "__session__",
    label: "Start",
    detail: "Start of the displayed plan.",
    timestep: -1,
    action: "session",
    actionArguments: [],
    group: "Session",
    selection: "neutral",
    nodeType: "root",
    remainingSolutions,
    remainingFacets,
    solutionReduction: 0,
    facetReduction: 0,
    available: true,
    selectable: false,
    tokens: ["start", "plan-space", "session"],
  };
}

function describeSpaceChange(
  previousAvailableIds: ReadonlySet<string>,
  mapped: PlanPilotUiFacet[],
): string | undefined {
  if (!mapped.length) {
    return "Current space is empty for this selection.";
  }
  if (!previousAvailableIds.size) {
    return undefined;
  }
  const nextAvailableIds = new Set(mapped.map((facet) => facet.id));
  const added = mapped.filter(
    (facet) => !previousAvailableIds.has(facet.id),
  ).length;
  const removed = Array.from(previousAvailableIds).filter(
    (id) => !nextAvailableIds.has(id),
  ).length;
  return `${added} actions entered the current space · ${removed} left it`;
}

function nextInspectedFacetId(
  inspectedFacetId: string | undefined,
  facets: PlanPilotUiFacet[],
  hasNavigableFacets: boolean,
): string | undefined {
  if (!hasNavigableFacets) {
    return undefined;
  }
  return inspectedFacetId &&
    facets.some((facet) => facet.id === inspectedFacetId)
    ? inspectedFacetId
    : undefined;
}

function isStateFacet(facet: PlanPilotFacet): boolean {
  return facet.id.startsWith("holds(");
}

function byTimestepAndLabel(
  left: PlanPilotUiFacet,
  right: PlanPilotUiFacet,
): number {
  return (
    left.timestep - right.timestep || left.label.localeCompare(right.label)
  );
}

function graphOrderWeight(facet: PlanPilotUiFacet): number {
  if (facet.selection === "positive") {
    return 0;
  }
  if (facet.facetType === "implied") {
    return 1;
  }
  if (!facet.available) {
    return 4;
  }
  if (facet.selection === "negative") {
    return 3;
  }
  return 2;
}
