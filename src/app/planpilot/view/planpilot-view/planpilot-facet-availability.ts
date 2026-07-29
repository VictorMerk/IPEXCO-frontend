import { PlanPilotUiFacet } from "./planpilot-view.models";

export function planPilotFacetAvailabilityReason(
  facet: PlanPilotUiFacet,
  activeConstraints: PlanPilotUiFacet[],
  knownFacets: Readonly<Record<string, PlanPilotUiFacet>>,
): string | undefined {
  if (facet.facetType === "implied" || facet.selectable === false) {
    const causes = [
      ...(facet.impliedBy ?? []),
      ...(facet.causedBy ? [facet.causedBy] : []),
    ]
      .map((id) => knownFacets[id]?.label ?? id)
      .filter(Boolean);
    return causes.length
      ? `Fixed by ${causes.slice(0, 2).join(", ")}.`
      : "PlanPilot found this action in every remaining plan.";
  }
  if (facet.available) {
    return undefined;
  }
  const competing = activeConstraints.find(
    (constraint) =>
      constraint.id !== facet.id &&
      constraint.selection === "positive" &&
      !constraint.abstractTimeStep &&
      !facet.abstractTimeStep &&
      constraint.timestep === facet.timestep,
  );
  if (competing) {
    return `${competing.label} is required at the same timestep.`;
  }
  const constraints = activeConstraints
    .filter((constraint) => constraint.id !== facet.id)
    .slice(0, 2)
    .map((constraint) => constraint.label);
  return constraints.length
    ? `Unavailable with ${constraints.join(", ")}.`
    : "Unavailable in the current plan space.";
}
