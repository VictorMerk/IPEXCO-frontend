import { inject, Injectable } from "@angular/core";
import { concat, Observable, of, switchMap, takeWhile, timer } from "rxjs";
import {
  PlanPilotQueryJob,
  PlanPilotQueryJobType,
  PlanPilotService,
} from "./planpilot.service";

@Injectable({ providedIn: "root" })
export class PlanPilotQueryJobsService {
  private readonly planPilot = inject(PlanPilotService);
  private readonly pollIntervalMs = 500;

  run$(
    runId: string,
    request: {
      type: PlanPilotQueryJobType;
      facetId?: string;
      solutionStart?: number;
      solutionNumber?: number;
      expectedSelectionRevision?: number;
      timeoutSeconds?: number;
    },
  ): Observable<PlanPilotQueryJob> {
    return this.planPilot.startQueryJob$(runId, request).pipe(
      switchMap((started) =>
        concat(
          of(started),
          timer(0, this.pollIntervalMs).pipe(
            switchMap(() => this.planPilot.getQueryJob$(runId, started.jobId)),
            takeWhile((job) => !this.isTerminal(job), true),
          ),
        ),
      ),
    );
  }

  cancel$(runId: string, jobId: string): Observable<PlanPilotQueryJob> {
    return this.planPilot.cancelQueryJob$(runId, jobId);
  }

  private isTerminal(job: PlanPilotQueryJob): boolean {
    return ["succeeded", "failed", "cancelled"].includes(job.status);
  }
}
