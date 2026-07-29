import { PlanPilotFacet } from '../../service/planpilot.service';

export type FacetSelection = 'positive' | 'negative' | 'neutral';
export type FacetFilter = 'all' | 'open' | 'selected' | 'excluded';

export interface PlanPilotUiFacet {
  id: string;
  label: string;
  detail: string;
  timestep: number;
  action: string;
  actionArguments?: string[];
  abstractTimeStep?: boolean;
  group: string;
  selection: FacetSelection;
  remainingSolutions: number | null;
  remainingFacets: number | null;
  solutionReduction: number | null;
  facetReduction: number | null;
  available: boolean;
  selectable?: boolean;
  parentId?: string;
  facetType?: PlanPilotFacet['facetType'];
  impliedBy?: string[];
  causedBy?: string;
  nodeType?: 'root' | 'goal' | 'time' | 'plan' | 'path' | 'candidate' | 'excluded' | 'query';
  tokens: string[];
  solutionContext?: boolean;
  userConstraint?: boolean;
  meta?: string;
  comparisonState?: 'same' | 'moved' | 'only-a' | 'only-b';
}

export interface PendingFacetSelection {
  facetId: string;
  label: string;
  timestep: number;
  selection: FacetSelection;
  previousSelection: FacetSelection;
}

export interface PlanPilotConstraintChange {
  facetId: string;
  label: string;
  timestep: number;
  from: FacetSelection;
  to: FacetSelection;
}

export interface PlanPilotConstraintTransaction {
  label: string;
  changes: PlanPilotConstraintChange[];
}

export function isStructuralPlanPilotFacet(facet: PlanPilotUiFacet): boolean {
  return facet.nodeType === 'root' || facet.nodeType === 'goal' || facet.nodeType === 'time';
}
