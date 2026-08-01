import {
  array,
  boolean,
  coerce,
  enum as zenum,
  infer as zinfer,
  nativeEnum,
  number,
  object,
  string,
} from "zod";

export enum PlanPilotSelectionState {
  NEUTRAL = "neutral",
  POSITIVE = "positive",
  NEGATIVE = "negative",
}

export const PlanPilotSelectionStateZ = nativeEnum(PlanPilotSelectionState);

export enum PlanPilotFacetKind {
  ACTION = "action",
  STATE = "state",
}

export const PlanPilotFacetKindZ = nativeEnum(PlanPilotFacetKind);

export type PlanPilotFacet = zinfer<typeof PlanPilotFacetZ>;

export const PlanPilotFacetMetricPairZ = object({
  positive: number().nullable(),
  negative: number().nullable(),
});

export const PlanPilotFacetMetricsZ = object({
  solution: PlanPilotFacetMetricPairZ,
  facets: PlanPilotFacetMetricPairZ,
});

export const PlanPilotFacetZ = object({
  id: string(),
  label: string(),
  timestep: number().int().nullable(),
  selectionState: PlanPilotSelectionStateZ,
  facetKind: PlanPilotFacetKindZ.optional(),
  selectable: boolean().optional(),
  facetType: zenum([
    "plan",
    "selected",
    "implied",
    "optional",
    "empty",
  ]).optional(),
  reduction: PlanPilotFacetMetricsZ.optional(),
  remaining: PlanPilotFacetMetricsZ.optional(),
});

export function isSelectableFacet(facet: PlanPilotFacet): boolean {
  return facet.selectable !== false;
}

export const PlanPilotSolutionZ = object({
  label: string(),
  facets: array(PlanPilotFacetZ),
});

export type PlanPilotSolution = zinfer<typeof PlanPilotSolutionZ>;

export enum PlanPilotEncoding {
  EXACT = "exact",
  BOUNDED = "bounded",
}

export const PlanPilotEncodingZ = nativeEnum(PlanPilotEncoding);

export const PlanPilotSessionConfigurationZ = object({
  horizon: number().int().positive(),
  encoding: PlanPilotEncodingZ,
  abstractTimeSteps: boolean(),
  stateFacets: boolean().default(false),
});

export type PlanPilotSessionConfiguration = zinfer<
  typeof PlanPilotSessionConfigurationZ
>;

export enum PlanPilotRunStatus {
  CREATED = "CREATED",
  STARTING = "STARTING",
  READY = "READY",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  STOPPED = "STOPPED",
}

export const PlanPilotRunStatusZ = nativeEnum(PlanPilotRunStatus);

export const PlanPilotFacetsResponseZ = object({
  runId: string(),
  selectionRevision: number().int().nonnegative().optional(),
  solutionCount: number().int().nonnegative().nullable().optional(),
  solution: PlanPilotSolutionZ.optional(),
  facets: array(PlanPilotFacetZ),
});

export type PlanPilotFacetsResponse = zinfer<typeof PlanPilotFacetsResponseZ>;

export const StartPlanPilotSessionResponseZ = object({
  runId: string(),
  externalSessionId: string(),
  status: PlanPilotRunStatusZ,
  configuration: PlanPilotSessionConfigurationZ,
  expiresAt: coerce.date().optional(),
  hasPlan: boolean().optional(),
  minimumHorizon: number().int().positive().nullable().optional(),
  selectionRevision: number().int().nonnegative().optional(),
  solutionCount: number().int().nonnegative().nullable().optional(),
  solution: PlanPilotSolutionZ.nullable().optional(),
  facets: array(PlanPilotFacetZ),
});

export type StartPlanPilotSessionResponse = zinfer<
  typeof StartPlanPilotSessionResponseZ
>;

export enum PlanPilotQueryType {
  FACETS = "facets",
  FACET_COUNT = "facetCount",
  FACET_REDUCTION = "facetReduction",
  SOLUTION = "solution",
  SOLUTION_COUNT = "solutionCount",
  SOLUTION_REDUCTION = "solutionReduction",
  IMPLIED_FACETS = "impliedFacets",
}

export const PlanPilotQueryTypeZ = nativeEnum(PlanPilotQueryType);

export const PlanPilotQueryResultZ = object({
  type: PlanPilotQueryTypeZ,
  value: number().optional(),
  facets: array(PlanPilotFacetZ).optional(),
  solutions: array(PlanPilotSolutionZ).optional(),
});

export type PlanPilotQueryResult = zinfer<typeof PlanPilotQueryResultZ>;

export const QueryPlanPilotSessionResponseZ = object({
  runId: string(),
  selectionRevision: number().int().nonnegative().optional(),
  solutionCount: number().int().nonnegative().nullable().optional(),
  result: PlanPilotQueryResultZ,
});

export type QueryPlanPilotSessionResponse = zinfer<
  typeof QueryPlanPilotSessionResponseZ
>;

export interface QueryPlanPilotSessionRequest {
  type: PlanPilotQueryType;
  solutionNumber?: number;
  solutionMode?: "single" | "prefix";
}

export interface StartPlanPilotSessionRequest {
  projectId: string;
  horizon: number;
  encoding: PlanPilotEncoding;
  abstractTimeSteps: boolean;
  stateFacets?: boolean;
}

export interface SelectPlanPilotFacetRequest {
  facetId: string;
  selectionState: PlanPilotSelectionState;
  previousSelectionState?: PlanPilotSelectionState;
}
