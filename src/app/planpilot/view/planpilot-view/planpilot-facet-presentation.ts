import type { PlanPilotGraphVisualState } from "../../components/planpilot-graph/planpilot-graph.component";
import {
  FacetSelection,
  isStructuralPlanPilotFacet,
  PendingFacetSelection,
  PlanPilotUiFacet,
} from "./planpilot-view.models";

export interface PlanPilotFacetPresentationContext {
  displayedPlanIds: ReadonlySet<string>;
  activePinnedFacetIds: ReadonlySet<string>;
  pendingSelections: Readonly<Record<string, PendingFacetSelection>>;
  solutionCount: number | null;
  comparisonActive?: boolean;
  comparisonStates?: Readonly<
    Record<string, "same" | "moved" | "only-a" | "only-b">
  >;
}

export type PlanPilotDecoratedGraphFacet = PlanPilotUiFacet & {
  visualState: PlanPilotGraphVisualState;
};

export function selectionLabel(selection: FacetSelection): string {
  switch (selection) {
    case "positive":
      return "Required by you";
    case "negative":
      return "Forbidden by you";
    default:
      return "Available";
  }
}

export function isUserConstraint(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): boolean {
  return (
    !isStructuralPlanPilotFacet(facet) &&
    facet.selection !== "neutral" &&
    (facet.facetType === "selected" ||
      context.activePinnedFacetIds.has(facet.id))
  );
}

export function isDisplayedPlanFacet(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): boolean {
  return (
    Boolean(facet.solutionContext) || context.displayedPlanIds.has(facet.id)
  );
}

export function isRequiredFacet(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): boolean {
  return (
    facet.selection === "positive" &&
    (context.pendingSelections[facet.id]?.selection === "positive" ||
      isUserConstraint(facet, context))
  );
}

export function isForbiddenFacet(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): boolean {
  return (
    facet.selection === "negative" &&
    (context.pendingSelections[facet.id]?.selection === "negative" ||
      isUserConstraint(facet, context))
  );
}

export function facetStateLabel(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): string {
  const pending = context.pendingSelections[facet.id]?.selection;
  const inDisplayedPlan = isDisplayedPlanFacet(facet, context);
  if (pending) {
    const pendingLabel =
      pending === "positive"
        ? "Require pending"
        : pending === "negative"
          ? "Forbid pending"
          : "Remove pending";
    return inDisplayedPlan ? `Displayed plan · ${pendingLabel}` : pendingLabel;
  }
  if (inDisplayedPlan) {
    return isUserConstraint(facet, context) && facet.selection === "positive"
      ? "Displayed plan · Required by you"
      : "Displayed plan · No constraint";
  }
  if (facet.facetType === "implied") {
    return "Occurs in every plan";
  }
  if (isUserConstraint(facet, context)) {
    return selectionLabel(facet.selection);
  }
  if (!facet.available) {
    return "Outside current space";
  }
  return selectionLabel(facet.selection);
}

export function buildGoalFacet(
  lastAction: PlanPilotUiFacet,
  solutionCount: number | null,
): PlanPilotUiFacet {
  return {
    id: "__goal__",
    label: "Goal reached",
    detail: "The displayed plan satisfies the planning goal.",
    timestep: lastAction.timestep + 1,
    action: "goal",
    actionArguments: [],
    group: "Goal",
    selection: "positive",
    remainingSolutions: solutionCount,
    remainingFacets: 0,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    parentId: lastAction.id,
    nodeType: "goal",
    tokens: ["goal", "reached"],
    solutionContext: true,
  };
}

export function decorateGraphFacet(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): PlanPilotDecoratedGraphFacet {
  const decorated: PlanPilotDecoratedGraphFacet = {
    ...facet,
    comparisonState: context.comparisonActive
      ? context.comparisonStates?.[facet.id]
      : undefined,
    userConstraint:
      isRequiredFacet(facet, context) || isForbiddenFacet(facet, context),
    visualState: graphVisualState(facet, context),
  };
  return { ...decorated, meta: graphFacetMeta(decorated, context) };
}

function graphVisualState(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): PlanPilotGraphVisualState {
  if (facet.nodeType === "root") {
    return "root";
  }
  if (facet.nodeType === "goal") {
    return "goal";
  }
  if (facet.nodeType === "time") {
    return "time";
  }
  if (isDisplayedPlanFacet(facet, context)) {
    return "displayed-plan";
  }
  if (facet.facetType === "implied") {
    return "implied";
  }
  if (facet.facetType === "empty") {
    return "empty";
  }
  if (isForbiddenFacet(facet, context)) {
    return "forbidden";
  }
  if (isRequiredFacet(facet, context)) {
    return "required";
  }
  if (!facet.available) {
    return facet.nodeType === "query" ? "query" : "unavailable";
  }
  return facet.nodeType === "query" ? "query" : "alternative";
}

function graphFacetMeta(
  facet: PlanPilotUiFacet,
  context: PlanPilotFacetPresentationContext,
): string {
  const pending = context.pendingSelections[facet.id]?.selection;
  if (facet.nodeType === "root") {
    return context.solutionCount === null
      ? "valid plan count pending"
      : `${context.solutionCount} valid plan${context.solutionCount === 1 ? "" : "s"}`;
  }
  if (facet.nodeType === "goal") {
    return "goal reached";
  }
  if (facet.facetType === "empty") {
    return `unused bounded step · t${facet.timestep}`;
  }
  const timestep = facet.abstractTimeStep ? "any step" : `t${facet.timestep}`;
  if (facet.selection === "negative") {
    return `${pending === "negative" ? "forbid pending" : "forbidden by you"} · ${timestep}`;
  }
  if (facet.facetType === "implied") {
    return `in every plan · ${timestep}`;
  }
  if (facet.solutionContext) {
    const constraintText =
      pending === "positive"
        ? " · require pending"
        : pending === "negative"
          ? " · forbid pending"
          : isUserConstraint(facet, context) && facet.selection === "positive"
            ? " · required by you"
            : "";
    return `displayed plan${constraintText} · ${timestep}`;
  }
  if (isRequiredFacet(facet, context)) {
    return `${pending === "positive" ? "require pending" : "required by you"} · ${timestep}`;
  }
  if (!facet.available) {
    return `active constraint · ${timestep}`;
  }
  return `available · ${timestep}`;
}
