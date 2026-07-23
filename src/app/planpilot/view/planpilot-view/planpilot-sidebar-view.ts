import {
  PlanPilotActionFilterView,
  PlanPilotActionRowView,
} from "../../components/planpilot-sidebar-actions/planpilot-sidebar-actions.component";
import {
  PlanPilotPlanActionView,
  PlanPilotPlanSummaryView,
} from "../../components/planpilot-sidebar-plans/planpilot-sidebar-plans.component";
import { PlanPilotPlanSummary } from "./planpilot-analysis";
import {
  FacetFilter,
  PlanPilotUiFacet,
  isStructuralPlanPilotFacet,
} from "./planpilot-view.models";

export interface PlanPilotActionViewContext {
  timestepLabel: (facet: PlanPilotUiFacet) => string;
  stateLabel: (facet: PlanPilotUiFacet) => string;
  displayedPlan: (facet: PlanPilotUiFacet) => boolean;
  required: (facet: PlanPilotUiFacet) => boolean;
  forbidden: (facet: PlanPilotUiFacet) => boolean;
  selectedFacetId?: string;
}

export function filterPlanPilotActions(
  facets: PlanPilotUiFacet[],
  timestep: number | "any" | null,
  filter: FacetFilter,
  query: string,
  displayedFacetIds: ReadonlySet<string> = new Set(),
): PlanPilotUiFacet[] {
  const normalizedQuery = query.trim().toLowerCase();
  return facets
    .filter((facet) => !isStructuralPlanPilotFacet(facet))
    .filter(
      (facet) =>
        timestep === null ||
        (timestep === "any"
          ? Boolean(facet.abstractTimeStep)
          : !facet.abstractTimeStep && facet.timestep === timestep),
    )
    .filter((facet) => matchesActionFilter(facet, filter, displayedFacetIds))
    .filter(
      (facet) => !normalizedQuery || matchesActionQuery(facet, normalizedQuery),
    );
}

export function buildActionFilterViews(
  facets: PlanPilotUiFacet[],
  timestep: number | "any" | null,
  query: string,
  filters: { value: FacetFilter; label: string }[],
  displayedFacetIds: ReadonlySet<string> = new Set(),
): PlanPilotActionFilterView[] {
  return filters.map((filter) => ({
    ...filter,
    count: filterPlanPilotActions(
      facets,
      timestep,
      filter.value,
      query,
      displayedFacetIds,
    ).length,
  }));
}

export function buildTimestepActionCounts(
  facets: PlanPilotUiFacet[],
): Record<string, number> {
  return facets.reduce<Record<string, number>>((counts, facet) => {
    if (isStructuralPlanPilotFacet(facet) || facet.available === false) {
      return counts;
    }
    const key = facet.abstractTimeStep ? "any" : String(facet.timestep);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildActionRowView(
  facet: PlanPilotUiFacet,
  context: PlanPilotActionViewContext,
): PlanPilotActionRowView {
  return {
    facet,
    timestepLabel: context.timestepLabel(facet),
    stateLabel: context.stateLabel(facet),
    displayedPlan: context.displayedPlan(facet),
    required: context.required(facet),
    forbidden: context.forbidden(facet),
    selected: context.selectedFacetId === facet.id,
  };
}

export function buildPlanActionViews(
  facets: PlanPilotUiFacet[],
  timestepLabel: (facet: PlanPilotUiFacet) => string,
  isVisible?: (facet: PlanPilotUiFacet) => boolean,
): PlanPilotPlanActionView[] {
  return facets.map((facet) => ({
    id: facet.id,
    label: facet.label,
    timestepLabel: timestepLabel(facet),
    visible: isVisible?.(facet),
  }));
}

export function buildPlanSummaryViews(
  summaries: PlanPilotPlanSummary[],
  summaryText: (summary: PlanPilotPlanSummary) => string,
): PlanPilotPlanSummaryView[] {
  return summaries.map((summary) => ({
    number: summary.number,
    title: `Plan ${summary.number}`,
    text: summaryText(summary),
  }));
}

function matchesActionFilter(
  facet: PlanPilotUiFacet,
  filter: FacetFilter,
  displayedFacetIds: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case "open":
      return (
        facet.available &&
        facet.selectable !== false &&
        facet.selection === "neutral" &&
        facet.facetType !== "implied" &&
        !displayedFacetIds.has(facet.id)
      );
    case "selected":
      return facet.selection === "positive";
    case "excluded":
      return facet.selection === "negative";
    default:
      return true;
  }
}

function matchesActionQuery(facet: PlanPilotUiFacet, query: string): boolean {
  return [
    facet.label,
    facet.detail,
    facet.action,
    facet.group,
    ...facet.tokens,
  ].some((value) => value.toLowerCase().includes(query));
}
