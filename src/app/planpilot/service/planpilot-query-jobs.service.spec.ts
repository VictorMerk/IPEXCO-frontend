import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { of } from "rxjs";
import { PlanPilotQueryJob, PlanPilotService } from "./planpilot.service";
import { PlanPilotQueryJobsService } from "./planpilot-query-jobs.service";

describe("PlanPilotQueryJobsService", () => {
  let jobs: PlanPilotQueryJobsService;
  let service: jasmine.SpyObj<PlanPilotService>;

  beforeEach(() => {
    service = jasmine.createSpyObj<PlanPilotService>("PlanPilotService", [
      "startQueryJob$",
      "getQueryJob$",
      "cancelQueryJob$",
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlanPilotQueryJobsService,
        { provide: PlanPilotService, useValue: service },
      ],
    });
    jobs = TestBed.inject(PlanPilotQueryJobsService);
  });

  it("polls until the query job is finished", fakeAsync(() => {
    service.startQueryJob$.and.returnValue(of(job("queued")));
    service.getQueryJob$.and.returnValues(
      of(job("running")),
      of({
        ...job("succeeded"),
        result: { type: "solutionCount", value: 9 },
      }),
    );
    const statuses: string[] = [];

    jobs
      .run$("run-1", {
        type: "solutionCount",
        expectedSelectionRevision: 2,
      })
      .subscribe((result) => statuses.push(result.status));
    tick(0);
    tick(500);

    expect(statuses).toEqual(["queued", "running", "succeeded"]);
    expect(service.getQueryJob$).toHaveBeenCalledTimes(2);
  }));

  it("forwards cancellation to the active run", () => {
    service.cancelQueryJob$.and.returnValue(of(job("cancelled")));

    jobs.cancel$("run-1", "job-1").subscribe();

    expect(service.cancelQueryJob$).toHaveBeenCalledWith("run-1", "job-1");
  });
});

function job(status: PlanPilotQueryJob["status"]): PlanPilotQueryJob {
  return {
    runId: "run-1",
    jobId: "job-1",
    expiresAt: "2026-07-26T00:00:00Z",
    type: "solutionCount",
    status,
    selectionRevision: 2,
    createdAt: "2026-07-25T23:00:00Z",
  };
}
