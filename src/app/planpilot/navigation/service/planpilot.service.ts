import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { environment } from "src/environments/environment";
import {
  PlanPilotFacetsResponse,
  PlanPilotFacetsResponseZ,
  QueryPlanPilotSessionRequest,
  QueryPlanPilotSessionResponse,
  QueryPlanPilotSessionResponseZ,
  SelectPlanPilotFacetRequest,
  StartPlanPilotSessionRequest,
  StartPlanPilotSessionResponse,
  StartPlanPilotSessionResponseZ,
} from "../domain/planpilot";

@Injectable()
export class PlanPilotService {
  private http = inject(HttpClient);
  private BASE_URL = environment.apiURL + "planpilot/";

  startSession$(
    request: StartPlanPilotSessionRequest,
  ): Observable<StartPlanPilotSessionResponse> {
    return this.http
      .post<unknown>(this.BASE_URL + "sessions", request)
      .pipe(map((data) => StartPlanPilotSessionResponseZ.parse(data)));
  }

  listFacets$(sessionId: string): Observable<PlanPilotFacetsResponse> {
    return this.http
      .post<unknown>(
        this.BASE_URL + "sessions/" + sessionId + "/facets/list",
        {},
      )
      .pipe(map((data) => PlanPilotFacetsResponseZ.parse(data)));
  }

  selectFacet$(
    sessionId: string,
    request: SelectPlanPilotFacetRequest,
  ): Observable<PlanPilotFacetsResponse> {
    return this.http
      .post<unknown>(
        this.BASE_URL + "sessions/" + sessionId + "/facets/select",
        request,
      )
      .pipe(map((data) => PlanPilotFacetsResponseZ.parse(data)));
  }

  applyFacets$(
    sessionId: string,
    requests: SelectPlanPilotFacetRequest[],
  ): Observable<PlanPilotFacetsResponse> {
    return this.http
      .post<unknown>(
        this.BASE_URL + "sessions/" + sessionId + "/facets/apply",
        {
          selections: requests,
        },
      )
      .pipe(map((data) => PlanPilotFacetsResponseZ.parse(data)));
  }

  query$(
    sessionId: string,
    request: QueryPlanPilotSessionRequest,
  ): Observable<QueryPlanPilotSessionResponse> {
    return this.http
      .post<unknown>(
        this.BASE_URL + "sessions/" + sessionId + "/query",
        request,
      )
      .pipe(map((data) => QueryPlanPilotSessionResponseZ.parse(data)));
  }

  stopSession$(sessionId: string): Observable<void> {
    return this.http.delete<void>(this.BASE_URL + "sessions/" + sessionId);
  }
}
