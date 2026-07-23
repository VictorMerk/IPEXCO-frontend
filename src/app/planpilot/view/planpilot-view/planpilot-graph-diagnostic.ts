import { PlanPilotGraphConnection, PlanPilotGraphSnapshot } from '../../components/planpilot-graph/planpilot-graph.component';
import { isStructuralPlanPilotFacet, PlanPilotUiFacet } from './planpilot-view.models';

export interface PlanPilotGraphDiagnostic {
  schemaVersion: string;
  generatedAt: string;
  location: string;
  applicationAssets: string[];
  browser: {
    viewport: { width: number; height: number; devicePixelRatio: number };
    userAgent: string;
  };
  project: { id?: string; name?: string };
  session: Record<string, unknown>;
  ui: Record<string, unknown>;
  integrity: {
    backendFacetCount: number;
    graphFacetCount: number;
    connectionCount: number;
    omittedFacetIds: string[];
    issues: string[];
  };
  facets: PlanPilotUiFacet[];
  representativeSolution: PlanPilotUiFacet[];
  connections: PlanPilotGraphConnection[];
  renderedGraph: PlanPilotGraphSnapshot | undefined;
}

interface DiagnosticInput extends Omit<PlanPilotGraphDiagnostic, 'schemaVersion' | 'integrity' | 'facets'> {
  allFacets: PlanPilotUiFacet[];
  graphFacets: PlanPilotUiFacet[];
}

export function buildPlanPilotGraphDiagnostic(input: DiagnosticInput): PlanPilotGraphDiagnostic {
  const facets = input.allFacets.filter((facet) => !isStructuralPlanPilotFacet(facet));
  return {
    schemaVersion: 'ipexco-planpilot-graph-diagnostic-v4',
    generatedAt: input.generatedAt,
    location: input.location,
    applicationAssets: input.applicationAssets,
    browser: input.browser,
    project: input.project,
    session: input.session,
    ui: input.ui,
    integrity: {
      backendFacetCount: facets.length,
      graphFacetCount: input.graphFacets.filter((facet) => !isStructuralPlanPilotFacet(facet)).length,
      connectionCount: input.connections.length,
      omittedFacetIds: omittedFacetIds(input.allFacets, input.graphFacets),
      issues: graphIntegrityIssues(input.graphFacets, input.connections),
    },
    facets,
    representativeSolution: input.representativeSolution,
    connections: input.connections,
    renderedGraph: input.renderedGraph,
  };
}

export function javascriptAssetNames(scriptSources: string[], baseUrl: string): string[] {
  const assets = scriptSources.flatMap((source) => {
    if (!source) {
      return [];
    }
    try {
      const filename = new URL(source, baseUrl).pathname.split('/').pop();
      return filename?.endsWith('.js') ? [filename] : [];
    } catch {
      return [];
    }
  });
  return Array.from(new Set(assets)).sort();
}

export function graphIntegrityIssues(
  graphFacets: PlanPilotUiFacet[],
  connections: PlanPilotGraphConnection[],
): string[] {
  const issues: string[] = [];
  const ids = graphFacets.map((facet) => facet.id);
  const idSet = new Set(ids);
  const facetById = new Map(graphFacets.map((facet) => [facet.id, facet]));
  const incomingByTarget = new Map<string, PlanPilotGraphConnection[]>();
  connections.forEach((connection) => {
    incomingByTarget.set(connection.targetId, [
      ...(incomingByTarget.get(connection.targetId) ?? []),
      connection,
    ]);
  });

  const duplicateIds = Array.from(new Set(ids.filter((id, index) => ids.indexOf(id) !== index)));
  if (duplicateIds.length) {
    issues.push(`Duplicate graph facet ids: ${duplicateIds.join(', ')}`);
  }
  graphFacets
    .filter((facet) => facet.solutionContext && facet.parentId && !idSet.has(facet.parentId))
    .forEach((facet) => issues.push(`Facet parent is missing from graph: ${facet.id} -> ${facet.parentId}`));

  const solutionFacets = graphFacets.filter((facet) => facet.solutionContext);
  solutionFacets.forEach((facet) => {
    const incoming = incomingByTarget.get(facet.id) ?? [];
    if (facet.parentId) {
      const parent = facetById.get(facet.parentId);
      if (parent && parent.timestep >= facet.timestep) {
        issues.push(`Facet parent is not earlier: ${facet.parentId} -> ${facet.id}`);
      }
      if (parent && !parent.solutionContext && parent.nodeType !== 'root') {
        issues.push(`Facet parent is outside the representative solution: ${facet.parentId} -> ${facet.id}`);
      }
    }
    if (incoming.length === 0) {
      issues.push(`Representative solution facet has no incoming connection: ${facet.id}`);
    } else if (incoming.length > 1) {
      issues.push(`Representative solution facet has multiple incoming connections: ${facet.id}`);
    }
  });

  const rootConnections = connections.filter((connection) => connection.sourceId === '__session__');
  if (solutionFacets.length && rootConnections.length !== 1) {
    issues.push(`Representative solution has ${rootConnections.length} root connections instead of 1.`);
  }
  const earliestSolutionFacet = [...solutionFacets].sort((left, right) => (
    left.timestep - right.timestep || left.id.localeCompare(right.id)
  ))[0];
  if (
    earliestSolutionFacet
    && rootConnections.length === 1
    && rootConnections[0].targetId !== earliestSolutionFacet.id
  ) {
    issues.push(`Root connection does not target the first representative solution facet: ${rootConnections[0].targetId}`);
  }

  connections.forEach((connection) => {
    const source = facetById.get(connection.sourceId);
    const target = facetById.get(connection.targetId);
    if (!source) {
      issues.push(`Connection source is missing: ${connection.sourceId}`);
    }
    if (!target) {
      issues.push(`Connection target is missing: ${connection.targetId}`);
    }
    if (target && !target.solutionContext) {
      issues.push(`Connection targets a facet outside the representative solution: ${connection.targetId}`);
    }
    if (source && source.nodeType !== 'root' && !source.solutionContext) {
      issues.push(`Connection starts outside the representative solution: ${connection.sourceId}`);
    }
    if (source && target && source.nodeType !== 'root' && source.timestep >= target.timestep) {
      issues.push(`Non-forward connection: ${connection.sourceId} -> ${connection.targetId}`);
    }
  });

  return issues;
}

function omittedFacetIds(allFacets: PlanPilotUiFacet[], graphFacets: PlanPilotUiFacet[]): string[] {
  const graphIds = new Set(graphFacets.map((facet) => facet.id));
  return allFacets
    .filter((facet) => !isStructuralPlanPilotFacet(facet) && !graphIds.has(facet.id))
    .map((facet) => facet.id);
}
