import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "src/environments/environment";

export type PlanPilotEncoding = "exact" | "bounded";
export type PlanPilotFacetSelectionState = "neutral" | "positive" | "negative";
export type PlanPilotQueryType =
  | "facets"
  | "facetCount"
  | "facetReduction"
  | "impliedFacets"
  | "solution"
  | "solutionCount"
  | "solutionReduction"
  | "selectionImpact";

export interface PlanPilotFacetMetricPair {
  positive: number | null;
  negative: number | null;
}

export interface PlanPilotFacetMetrics {
  solution: PlanPilotFacetMetricPair;
  facets: PlanPilotFacetMetricPair;
}

export interface PlanPilotFacet {
  id: string;
  label: string;
  timestep: number | null;
  selectionState: PlanPilotFacetSelectionState;
  action?: { name: string; arguments: string[] };
  abstractTimeStep?: boolean;
  facetKind?: "action" | "state";
  selectable?: boolean;
  facetType?: "plan" | "selected" | "implied" | "optional" | "empty";
  parentId?: string;
  impliedBy?: string[];
  causedBy?: string;
  reduction?: PlanPilotFacetMetrics;
  remaining?: PlanPilotFacetMetrics;
}

export interface PlanPilotConfiguration {
  horizon: number;
  encoding: PlanPilotEncoding;
  abstractTimeSteps: boolean;
}

export interface StartPlanPilotSessionRequest {
  projectId: string;
  horizon: number;
  encoding: PlanPilotEncoding;
  abstractTimeSteps: boolean;
}

export interface PlanPilotSessionResponse {
  runId: string;
  externalSessionId?: string;
  status: string;
  configuration: PlanPilotConfiguration;
  expiresAt?: string;
  hasPlan: boolean;
  minimumHorizon: number | null;
  selectionRevision: number;
  solutionCount: number | null;
  solution: { label: string; facets: PlanPilotFacet[] } | null;
  facets: PlanPilotFacet[];
  reused?: boolean;
}

export interface PlanPilotFacetListResponse {
  runId: string;
  selectionRevision: number;
  solutionCount: number | null;
  solution: { label: string; facets: PlanPilotFacet[] } | null;
  facets: PlanPilotFacet[];
}

export interface PlanPilotSelectionMutationResponse extends PlanPilotFacetListResponse {
  solution: { label: string; facets: PlanPilotFacet[] };
}

export interface SelectPlanPilotFacetRequest {
  facetId: string;
  selectionState: PlanPilotFacetSelectionState;
  previousSelectionState?: PlanPilotFacetSelectionState;
}

export interface ApplyPlanPilotFacetsRequest {
  selections: SelectPlanPilotFacetRequest[];
  expectedSelectionRevision?: number;
}

export interface PlanPilotQueryResult {
  type: PlanPilotQueryType;
  value?: number;
  facets?: PlanPilotFacet[];
  solutions?: { label: string; facets: PlanPilotFacet[] }[];
  facetId?: string;
  exact?: boolean;
  comparableToCurrent?: boolean;
  totalPlans?: number | null;
  require?: PlanPilotSelectionImpactDirection;
  forbid?: PlanPilotSelectionImpactDirection;
}

export interface PlanPilotSelectionImpactDirection {
  available: boolean;
  plansRemaining: number | null;
  planReduction: number | null;
}

export interface PlanPilotQueryResponse {
  runId: string;
  selectionRevision: number;
  solutionCount: number | null;
  result: PlanPilotQueryResult;
}

export interface StopPlanPilotSessionResponse {
  runId: string;
  externalSessionId?: string;
  status: string;
}

@Injectable({ providedIn: "root" })
export class PlanPilotService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiURL + "planpilot/sessions";

  startSession$(
    request: StartPlanPilotSessionRequest,
  ): Observable<PlanPilotSessionResponse> {
    return this.http.post<PlanPilotSessionResponse>(this.baseUrl, request);
  }

  listFacets$(runId: string): Observable<PlanPilotFacetListResponse> {
    return this.http.post<PlanPilotFacetListResponse>(
      `${this.baseUrl}/${runId}/facets/list`,
      {},
    );
  }

  revalidateSession$(runId: string): Observable<PlanPilotFacetListResponse> {
    return this.listFacets$(runId);
  }

  applyFacets$(
    runId: string,
    request: ApplyPlanPilotFacetsRequest,
  ): Observable<PlanPilotSelectionMutationResponse> {
    return this.http.post<PlanPilotSelectionMutationResponse>(
      `${this.baseUrl}/${runId}/facets/apply`,
      request,
    );
  }

  query$(
    runId: string,
    type: PlanPilotQueryType,
    solutionNumber?: number,
  ): Observable<PlanPilotQueryResponse> {
    return this.http.post<PlanPilotQueryResponse>(
      `${this.baseUrl}/${runId}/query`,
      {
        type,
        ...(solutionNumber === undefined ? {} : { solutionNumber }),
      },
    );
  }

  selectionImpact$(
    runId: string,
    facetId: string,
  ): Observable<PlanPilotQueryResponse> {
    return this.http.post<PlanPilotQueryResponse>(
      `${this.baseUrl}/${runId}/query`,
      { type: "selectionImpact", facetId },
    );
  }

  stopSession$(runId: string): Observable<StopPlanPilotSessionResponse> {
    return this.http.delete<StopPlanPilotSessionResponse>(
      `${this.baseUrl}/${runId}`,
    );
  }

  stopSessionOnUnload(runId: string): void {
    const token = localStorage.getItem("jwt-token");
    if (!token) {
      return;
    }
    void fetch(`${this.baseUrl}/${encodeURIComponent(runId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => undefined);
  }
}
