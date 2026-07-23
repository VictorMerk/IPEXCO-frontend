import { PlanPilotGraphConnection } from '../../components/planpilot-graph/planpilot-graph.component';

export type PlanPilotGraphFacetLike = {
  id: string;
  label: string;
  timestep: number;
  selection: 'positive' | 'negative' | 'neutral';
  available: boolean;
  parentId?: string;
  facetType?: 'plan' | 'selected' | 'implied' | 'optional' | 'empty';
  nodeType?: 'root' | 'goal' | 'time' | 'plan' | 'path' | 'candidate' | 'excluded' | 'query';
  solutionContext?: boolean;
};

export function buildPlanPilotGraphConnections(
  facets: PlanPilotGraphFacetLike[],
): PlanPilotGraphConnection[] {
  const facetIds = new Set(facets.map((facet) => facet.id));
  const connections: PlanPilotGraphConnection[] = [];

  facets.forEach((facet) => {
    if (!facet.solutionContext) {
      return;
    }
    const parentId = graphParentIdForFacet(facet, facets);
    if (!parentId || !facetIds.has(parentId)) {
      return;
    }

    connections.push({
      sourceId: parentId,
      targetId: facet.id,
      kind: 'plan',
      ...gapMetadata(
        facets.find((candidate) => candidate.id === parentId)!.timestep,
        facet.timestep,
      ),
    });
  });

  return connections;
}

export function buildPlanPilotViewGraphConnections(
  facets: PlanPilotGraphFacetLike[],
): PlanPilotGraphConnection[] {
  const connections = buildPlanPilotGraphConnections(facets);
  const connectedTargets = new Set(connections.map((connection) => connection.targetId));
  const firstSolutionFacet = facets
    .filter((facet) => facet.solutionContext && facet.nodeType !== 'goal')
    .sort((left, right) => left.timestep - right.timestep || left.id.localeCompare(right.id))[0];

  if (
    !firstSolutionFacet
    || firstSolutionFacet.parentId
    || connectedTargets.has(firstSolutionFacet.id)
  ) {
    return connections;
  }

  return [
    ...connections,
    { sourceId: '__session__', targetId: firstSolutionFacet.id, kind: 'plan' },
  ];
}

export function graphParentIdForFacet(
  facet: PlanPilotGraphFacetLike,
  facets: PlanPilotGraphFacetLike[],
): string | undefined {
  const explicitParent = facet.parentId
    ? facets.find((candidate) => (
      candidate.id === facet.parentId
      && candidate.solutionContext
      && candidate.timestep < facet.timestep
    ))
    : undefined;

  if (explicitParent) {
    return explicitParent.id;
  }

  return undefined;
}

function gapMetadata(
  sourceTimestep: number,
  targetTimestep: number,
): Pick<PlanPilotGraphConnection, 'gapTimesteps' | 'label'> {
  const gapTimesteps = Array.from(
    { length: Math.max(0, targetTimestep - sourceTimestep - 1) },
    (_, index) => sourceTimestep + index + 1,
  );
  if (!gapTimesteps.length) {
    return {};
  }
  const first = gapTimesteps[0];
  const last = gapTimesteps[gapTimesteps.length - 1];
  return {
    gapTimesteps,
    label: first === last ? `t${first} empty` : `t${first}–t${last} empty`,
  };
}
