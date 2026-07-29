import { PlanPilotUiFacet } from "./planpilot-view.models";

export interface PlanPilotGraphViewInput {
  facets: PlanPilotUiFacet[];
  displayedPlan: PlanPilotUiFacet[];
  goal?: PlanPilotUiFacet;
  inspectedFacetId?: string;
  limit: number;
  comparisonActive: boolean;
  comparisonStates: Record<
    string,
    "same" | "moved" | "only-a" | "only-b"
  >;
  comparisonPlans?: {
    a: PlanPilotUiFacet[];
    b: PlanPilotUiFacet[];
  };
  compare: (left: PlanPilotUiFacet, right: PlanPilotUiFacet) => number;
}

export function buildPlanPilotGraphView(
  input: PlanPilotGraphViewInput,
): PlanPilotUiFacet[] {
  const base = input.facets.filter(
    (facet) =>
      facet.nodeType === "root" ||
      facet.available ||
      (facet.selection !== "neutral" && facet.facetType !== "implied") ||
      facet.id === input.inspectedFacetId,
  );
  const displayedById = new Map(
    input.displayedPlan.map((facet) => [facet.id, facet]),
  );
  const mergedBase = base.map((facet): PlanPilotUiFacet => {
    const displayed = displayedById.get(facet.id);
    return displayed && facet.nodeType !== "root"
      ? { ...facet, parentId: displayed.parentId, solutionContext: true }
      : facet;
  });
  const baseIds = new Set(mergedBase.map((facet) => facet.id));
  const occupiedIds = new Set([
    ...baseIds,
    ...input.displayedPlan.map((facet) => facet.id),
  ]);
  const merged = [
    ...mergedBase,
    ...input.displayedPlan.filter((facet) => !baseIds.has(facet.id)),
    ...comparisonFacets(input, occupiedIds),
    ...(input.goal ? [input.goal] : []),
  ];
  if (merged.length <= input.limit) {
    return merged;
  }

  const mandatory = merged.filter(
    (facet) =>
      facet.nodeType === "root" ||
      facet.nodeType === "goal" ||
      (facet.selection !== "neutral" && facet.facetType !== "implied") ||
      facet.solutionContext ||
      Boolean(
        facet.comparisonState ||
          (input.comparisonActive && input.comparisonStates[facet.id]),
      ) ||
      facet.id === input.inspectedFacetId,
  );
  const mandatoryIds = new Set(mandatory.map((facet) => facet.id));
  const optionalByTimestep = new Map<number, PlanPilotUiFacet[]>();
  merged
    .filter((facet) => !mandatoryIds.has(facet.id))
    .sort(input.compare)
    .forEach((facet) => {
      optionalByTimestep.set(facet.timestep, [
        ...(optionalByTimestep.get(facet.timestep) ?? []),
        facet,
      ]);
    });
  const optionalCapacity = Math.max(0, input.limit - mandatory.length);
  const visibleIds = new Set([
    ...mandatoryIds,
    ...takeRoundRobin(optionalByTimestep, optionalCapacity).map(
      (facet) => facet.id,
    ),
  ]);
  return merged.filter((facet) => visibleIds.has(facet.id));
}

function comparisonFacets(
  input: PlanPilotGraphViewInput,
  occupiedIds: ReadonlySet<string>,
): PlanPilotUiFacet[] {
  if (!input.comparisonActive || !input.comparisonPlans) {
    return [];
  }
  const seen = new Set(occupiedIds);
  return [...input.comparisonPlans.a, ...input.comparisonPlans.b].flatMap(
    (facet) => {
      if (seen.has(facet.id)) {
        return [];
      }
      seen.add(facet.id);
      return [
        {
          ...facet,
          selection: "neutral" as const,
          facetType: "optional" as const,
          nodeType: "candidate" as const,
          solutionContext: false,
          parentId: undefined,
          comparisonState: input.comparisonStates[facet.id],
        },
      ];
    },
  );
}

function takeRoundRobin(
  facetsByTimestep: Map<number, PlanPilotUiFacet[]>,
  limit: number,
): PlanPilotUiFacet[] {
  const groups = Array.from(facetsByTimestep.entries())
    .sort(([left], [right]) => left - right)
    .map(([, facets]) => facets);
  const result: PlanPilotUiFacet[] = [];
  let index = 0;
  while (result.length < limit) {
    let added = false;
    for (const group of groups) {
      const facet = group[index];
      if (facet && result.length < limit) {
        result.push(facet);
        added = true;
      }
    }
    if (!added) {
      break;
    }
    index += 1;
  }
  return result;
}
