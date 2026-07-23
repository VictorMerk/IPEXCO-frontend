import { TestBed } from "@angular/core/testing";
import { ActivatedRoute } from "@angular/router";
import { of, Subject, throwError } from "rxjs";
import { defaultGeneralSetting } from "../../../project/domain/general-settings";
import { Project } from "../../../shared/domain/project";
import {
  PlanPilotFacet,
  PlanPilotFacetListResponse,
  PlanPilotQueryResponse,
  PlanPilotSelectionMutationResponse,
  PlanPilotService,
  PlanPilotSessionResponse,
} from "../../service/planpilot.service";
import { PLANPILOT_GRAPH_CONTRACT } from "./planpilot-graph-contract.fixture";
import { PlanPilotViewComponent } from "./planpilot-view.component";

describe("PlanPilotViewComponent selection workflow", () => {
  let component: PlanPilotViewComponent;
  let service: jasmine.SpyObj<PlanPilotService>;

  beforeEach(() => {
    service = jasmine.createSpyObj<PlanPilotService>("PlanPilotService", [
      "applyFacets$",
      "listFacets$",
      "query$",
      "selectionImpact$",
      "revalidateSession$",
      "startSession$",
      "stopSession$",
      "stopSessionOnUnload",
    ]);
    service.listFacets$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: null,
        solution: null,
        facets: [],
      }),
    );
    service.revalidateSession$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: null,
        solution: null,
        facets: [],
      }),
    );
    service.query$.and.callFake((_runId, type) =>
      of(
        type === "solution"
          ? {
              runId: "run-1",
              selectionRevision: 0,
              solutionCount: null,
              result: {
                type: "solution",
                solutions: [
                  {
                    label: "solution 1",
                    facets: [
                      {
                        id: "solution-action",
                        label: "unstack a b",
                        timestep: 3,
                        selectionState: "neutral",
                      },
                    ],
                  },
                ],
              },
            }
          : {
              runId: "run-1",
              selectionRevision: 0,
              solutionCount: 1,
              result: { type: "solutionCount", value: 1 },
            },
      ),
    );
    service.selectionImpact$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 1,
        result: {
          type: "selectionImpact",
          facetId: "include-me",
          exact: true,
          comparableToCurrent: true,
          totalPlans: 1,
          require: {
            available: true,
            plansRemaining: 1,
            planReduction: 0,
          },
          forbid: {
            available: false,
            plansRemaining: 0,
            planReduction: 1,
          },
        },
      }),
    );
    service.stopSession$.and.returnValue(
      of({ runId: "run-1", status: "STOPPED" }),
    );

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { data: of({ project: project("project-1") }) },
        },
        { provide: PlanPilotService, useValue: service },
      ],
    });

    component = TestBed.runInInjectionContext(
      () => new PlanPilotViewComponent(),
    );
    component.runId = "run-1";
    component.sessionStatus = "ready";
    component.facets = [facet("include-me"), facet("exclude-me")];
  });

  it("keeps one stop request alive when the page closes and the view is destroyed", () => {
    component.stopSessionOnUnload();
    component.ngOnDestroy();

    expect(service.stopSessionOnUnload).toHaveBeenCalledOnceWith("run-1");
    expect(component.runId).toBeUndefined();
  });

  it("starts a fresh session from the stopped state", () => {
    component.sessionProject = project("project-1");
    service.startSession$.and.returnValue(of(sessionResponse("run-2")));

    component.stopSession();

    expect(component.sessionStatus).toBe("stopped");
    expect(component.runId).toBeUndefined();

    component.startNewSession();

    expect(service.startSession$).toHaveBeenCalledWith(
      jasmine.objectContaining({ projectId: "project-1" }),
    );
    expect(component.sessionStatus).toBe("ready");
    expect(component.runId).toBe("run-2");
  });

  it("keeps a persisted page in the back-forward cache and revalidates it on return", () => {
    const persistedEvent = { persisted: true } as PageTransitionEvent;

    component.stopSessionOnUnload(persistedEvent);

    expect(component.runId).toBe("run-1");
    expect(service.stopSessionOnUnload).not.toHaveBeenCalled();

    component.restoreSessionFromBackForwardCache(persistedEvent);

    expect(service.revalidateSession$).toHaveBeenCalledOnceWith("run-1");
    expect(component.sessionStatus).toBe("ready");
    expect(component.lastSelectionMessage).toBe("PlanPilot session restored.");
  });

  it("starts a replacement when a cached session expired while the page was suspended", () => {
    service.revalidateSession$.and.returnValue(
      throwError(() => ({ status: 404 })),
    );
    service.startSession$.and.returnValue(
      of(sessionResponse("replacement-run")),
    );
    component.sessionProject = project("project-1");

    component.restoreSessionFromBackForwardCache({
      persisted: true,
    } as PageTransitionEvent);

    expect(service.startSession$).toHaveBeenCalledWith(
      jasmine.objectContaining({ projectId: "project-1" }),
    );
    expect(component.runId as string | undefined).toBe("replacement-run");
    expect(component.sessionStatus).toBe("ready");
  });

  it("keeps a cached session after a transient revalidation failure and retries the same run", () => {
    service.revalidateSession$.and.returnValue(
      throwError(() => ({ status: 503 })),
    );
    component.sessionProject = project("project-1");

    component.restoreSessionFromBackForwardCache({
      persisted: true,
    } as PageTransitionEvent);

    expect(component.runId).toBe("run-1");
    expect(component.sessionStatus).toBe("ready");
    expect(component.sessionRevalidationFailed).toBeTrue();
    expect(component.backendError).toContain("current session was kept");
    expect(service.startSession$).not.toHaveBeenCalled();

    service.revalidateSession$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 2,
        solutionCount: null,
        solution: null,
        facets: [backendFacet("restored", "positive")],
      }),
    );
    component.revalidateCurrentSession();

    expect(service.revalidateSession$).toHaveBeenCalledTimes(2);
    expect(service.revalidateSession$).toHaveBeenCalledWith("run-1");
    expect(component.runId).toBe("run-1");
    expect(component.sessionRevalidationFailed).toBeFalse();
  });

  it("stops a session that finishes starting after the view was destroyed", () => {
    const startResponse = new Subject<PlanPilotSessionResponse>();
    service.startSession$.and.returnValue(startResponse);
    component.runId = undefined;

    (
      component as unknown as { startSession: (value: unknown) => void }
    ).startSession(project("late-project"));
    component.ngOnDestroy();
    startResponse.next(sessionResponse("late-run"));

    expect(service.stopSession$).toHaveBeenCalledOnceWith("late-run");
    expect(component.runId).toBeUndefined();
    expect(component.sessionStatus).not.toBe("ready");
  });

  it("ignores and stops a stale session start response", () => {
    const firstStart = new Subject<PlanPilotSessionResponse>();
    const secondStart = new Subject<PlanPilotSessionResponse>();
    service.startSession$.and.returnValues(firstStart, secondStart);
    component.runId = undefined;
    const start = component as unknown as {
      startSession: (value: unknown) => void;
    };

    start.startSession(project("first-project"));
    start.startSession(project("second-project"));
    secondStart.next(sessionResponse("current-run"));
    firstStart.next(sessionResponse("stale-run"));

    expect(component.runId as string | undefined).toBe("current-run");
    expect(component.sessionStatus).toBe("ready");
    expect(service.stopSession$).toHaveBeenCalledWith("stale-run");
    expect(service.stopSession$).not.toHaveBeenCalledWith("current-run");
  });

  it("does not enter the ready state when session creation has no concrete plan", () => {
    service.startSession$.and.returnValue(
      of({
        runId: "run-without-plan",
        externalSessionId: "external-without-plan",
        status: "READY",
        configuration: {
          horizon: 12,
          encoding: "bounded",
          abstractTimeSteps: false,
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hasPlan: false,
        minimumHorizon: null,
        selectionRevision: 0,
        solutionCount: 0,
        solution: null,
        facets: [],
        reused: false,
      }),
    );
    (
      component as unknown as { startSession: (value: unknown) => void }
    ).startSession(project("project-1"));

    expect(component.sessionStatus).toBe("failed");
    expect(component.runId).toBeUndefined();
    expect(component.backendError).toContain("did not return a concrete plan");
    expect(service.stopSession$).toHaveBeenCalledWith("run-without-plan");
  });

  it("starts from the project and accepts the minimum horizon returned by the service", () => {
    service.startSession$.and.returnValue(
      of({
        runId: "large-run",
        externalSessionId: "large-external-run",
        status: "READY",
        configuration: {
          horizon: 20,
          encoding: "bounded",
          abstractTimeSteps: false,
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        hasPlan: true,
        minimumHorizon: 20,
        selectionRevision: 0,
        solutionCount: 1,
        solution: {
          label: "solution 1",
          facets: [backendFacet("confirmed-action", "positive")],
        },
        facets: [backendFacet("confirmed-action", "positive")],
        reused: false,
      }),
    );
    component.sessionHorizon = 0;

    (
      component as unknown as { startSession: (value: unknown) => void }
    ).startSession(project("project-1"));

    expect(service.startSession$).toHaveBeenCalledWith(
      jasmine.objectContaining({
        projectId: "project-1",
        horizon: 1,
        encoding: "bounded",
      }),
    );
    expect(component.sessionHorizon).toBe(20);
  });

  it("shows the returned plan without counting the plan space during startup", () => {
    service.query$.calls.reset();
    service.startSession$.and.returnValue(
      of({ ...sessionResponse("lazy-count-run"), solutionCount: null }),
    );
    component.runId = undefined;

    (
      component as unknown as { startSession: (value: Project) => void }
    ).startSession(project("project-1"));

    expect(component.sessionStatus).toBe("ready");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "move-1",
    ]);
    expect(component.solutionCountKnown).toBeFalse();
    expect(service.query$).not.toHaveBeenCalled();
  });

  it("turns a plan-space timeout into a short configuration hint", () => {
    const privateComponent = component as unknown as {
      errorMessage: (error: unknown) => string;
    };

    expect(
      privateComponent.errorMessage({
        error: {
          code: "PLAN_SPACE_TOO_LARGE",
          message: "generic upstream message",
        },
      }),
    ).toBe(
      "PlanPilot did not finish in time. Try a smaller horizon or exact mode.",
    );
  });

  it("keeps include, exclude, and clear as three separate actions", () => {
    const choice = component.facets[0];
    expect(component.canRequireFacet(choice)).toBeTrue();
    expect(component.canForbidFacet(choice)).toBeTrue();
    expect(component.canClearFacet(choice)).toBeFalse();

    component.applyFacetSelection(choice.id, "positive");
    expect(component.canRequireFacet(component.facets[0])).toBeFalse();
    expect(component.canForbidFacet(component.facets[0])).toBeTrue();
    expect(component.canClearFacet(component.facets[0])).toBeTrue();

    component.applyFacetSelection(choice.id, "positive");
    expect(component.facets[0].selection).toBe("positive");
    expect(component.pendingSelectionCount).toBe(1);

    component.applyFacetSelection(choice.id, "negative");
    expect(component.facets[0].selection).toBe("negative");
    expect(component.pendingSelectionEntries[0]).toEqual(
      jasmine.objectContaining({
        selection: "negative",
        previousSelection: "neutral",
      }),
    );

    component.applyFacetSelection(choice.id, "neutral");
    expect(component.facets[0].selection).toBe("neutral");
    expect(component.pendingSelectionCount).toBe(0);

    component.applyFacetSelection(choice.id, "negative");
    expect(component.canRequireFacet(component.facets[0])).toBeTrue();
    expect(component.canForbidFacet(component.facets[0])).toBeFalse();
    expect(component.canClearFacet(component.facets[0])).toBeTrue();
  });

  it("recognizes a positive selected facet as clearable after a backend refresh", () => {
    const applyBackendFacets = component as unknown as {
      applyBackendFacets: (facets: PlanPilotFacet[]) => void;
    };

    applyBackendFacets.applyBackendFacets([
      {
        ...backendFacet("persisted-include", "positive"),
        facetType: "selected",
        selectable: true,
      },
    ]);

    const included = component.facets.find(
      (item) => item.id === "persisted-include",
    )!;
    expect(component.facetStateLabel(included)).toBe("Required by you");
    expect(component.canClearFacet(included)).toBeTrue();
    expect(component.selectedConstraintCount).toBe(1);
  });

  it("does not select an action before the user chooses one", () => {
    const applyBackendFacets = component as unknown as {
      applyBackendFacets: (facets: PlanPilotFacet[]) => void;
    };
    component.inspectedFacetId = undefined;

    applyBackendFacets.applyBackendFacets([
      backendFacet("first-action", "positive"),
    ]);

    expect(component.inspectedFacetId).toBeUndefined();
  });

  it("clears an explicit action selection when that facet disappears", () => {
    const applyBackendFacets = component as unknown as {
      applyBackendFacets: (facets: PlanPilotFacet[]) => void;
    };
    component.inspectedFacetId = "selected-action";

    applyBackendFacets.applyBackendFacets([
      backendFacet("selected-action", "positive"),
    ]);
    expect(component.inspectedFacetId).toBe("selected-action");

    applyBackendFacets.applyBackendFacets([
      backendFacet("different-action", "positive"),
    ]);
    expect(component.inspectedFacetId).toBeUndefined();
  });

  it("stages include and exclude and commits both only after one confirmed request", () => {
    const response = new Subject<PlanPilotSelectionMutationResponse>();
    service.applyFacets$.and.returnValue(response);
    service.query$.calls.reset();

    component.applyFacetSelection("include-me", "positive");
    component.applyFacetSelection("exclude-me", "negative");

    expect(component.pendingSelectionCount).toBe(2);
    expect(
      component.facets.find((item) => item.id === "include-me")?.selection,
    ).toBe("positive");
    expect(
      component.facets.find((item) => item.id === "exclude-me")?.selection,
    ).toBe("negative");

    component.computeStagedSelections();

    expect(service.applyFacets$).toHaveBeenCalledTimes(1);
    expect(service.applyFacets$).toHaveBeenCalledWith("run-1", {
      expectedSelectionRevision: 0,
      selections: [
        {
          facetId: "exclude-me",
          selectionState: "negative",
          previousSelectionState: "neutral",
        },
        {
          facetId: "include-me",
          selectionState: "positive",
          previousSelectionState: "neutral",
        },
      ],
    });
    expect(component.selectionPending).toBeTrue();
    expect(component.pendingSelectionCount).toBe(2);

    response.next(
      mutationResponse(
        [
          backendFacet("include-me", "positive"),
          backendFacet("exclude-me", "negative"),
        ],
        [backendFacet("include-me", "positive")],
        null,
        1,
      ),
    );
    response.complete();

    expect(component.selectionPending).toBeFalse();
    expect(component.pendingSelectionCount).toBe(0);
    expect(component.selectedConstraintCount).toBe(1);
    expect(component.excludedConstraintCount).toBe(1);
    expect(component.solutionCountKnown).toBeFalse();
    expect(component.solutionCount).toBe(0);
    expect(component.representativeSolution.map((facet) => facet.id)).toEqual([
      "include-me",
    ]);
    expect(service.query$).not.toHaveBeenCalled();
  });

  it("keeps staged changes visible and retryable when the batch fails", () => {
    const response = new Subject<PlanPilotSelectionMutationResponse>();
    service.applyFacets$.and.returnValue(response);
    component.applyFacetSelection("include-me", "positive");
    component.applyFacetSelection("exclude-me", "negative");
    component.representativeSolution = [
      { ...facet("old-plan"), solutionContext: true },
    ];

    component.computeStagedSelections();
    response.error(new Error("batch failed"));

    expect(component.selectionPending).toBeFalse();
    expect(component.pendingSelectionCount).toBe(2);
    expect(
      component.facets.find((item) => item.id === "include-me")?.selection,
    ).toBe("positive");
    expect(
      component.facets.find((item) => item.id === "exclude-me")?.selection,
    ).toBe("negative");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "old-plan",
    ]);
    expect(component.lastSelectionMessage).toContain("not applied");
  });

  it("drops stale staged changes and reloads facets after a selection conflict", () => {
    const applyResponse = new Subject<PlanPilotSelectionMutationResponse>();
    const refreshedFacets = new Subject<PlanPilotFacetListResponse>();
    service.applyFacets$.and.returnValue(applyResponse);
    service.listFacets$.and.returnValue(refreshedFacets);
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();
    applyResponse.error({
      status: 409,
      error: {
        code: "SELECTION_CONFLICT",
        message: "The facet selection changed in another request.",
      },
    });

    expect(component.pendingSelectionCount).toBe(0);
    expect(component.selectionPending).toBeFalse();
    expect(
      component.facets.find((facet) => facet.id === "include-me")?.selection,
    ).toBe("neutral");
    expect(service.listFacets$).toHaveBeenCalledOnceWith("run-1");
    expect(component.lastSelectionMessage).toContain(
      "select your changes again",
    );

    refreshedFacets.next({
      runId: "run-1",
      selectionRevision: 2,
      solutionCount: null,
      solution: null,
      facets: [backendFacet("include-me", "negative")],
    });
    refreshedFacets.complete();

    expect(
      component.facets.find((facet) => facet.id === "include-me")?.selection,
    ).toBe("negative");
  });

  it("replaces a staged positive with another positive at the same timestep", () => {
    component.applyFacetSelection("include-me", "positive");
    component.applyFacetSelection("exclude-me", "positive");

    expect(component.pendingSelectionCount).toBe(1);
    expect(
      component.facets.find((item) => item.id === "include-me")?.selection,
    ).toBe("neutral");
    expect(
      component.facets.find((item) => item.id === "exclude-me")?.selection,
    ).toBe("positive");
  });

  it("does not treat abstract any-time facets as competing concrete timesteps", () => {
    component.facets = [
      { ...facet("abstract-a"), timestep: 0, abstractTimeStep: true },
      { ...facet("abstract-b"), timestep: 0, abstractTimeStep: true },
    ];

    component.applyFacetSelection("abstract-a", "positive");
    component.applyFacetSelection("abstract-b", "positive");

    expect(component.pendingSelectionCount).toBe(2);
    expect(
      component.facets.every((item) => item.selection === "positive"),
    ).toBeTrue();
  });

  it("keeps an applied facet as context when it leaves the current backend space", () => {
    service.applyFacets$.and.returnValue(
      of(mutationResponse([backendFacet("exclude-me", "negative")])),
    );

    component.applyFacetSelection("include-me", "positive");
    component.computeStagedSelections();

    const included = component.facets.find((item) => item.id === "include-me");
    expect(included?.selection).toBe("positive");
    expect(included?.available).toBeFalse();
    expect(component.graphFacets.map((item) => item.id)).toContain(
      "include-me",
    );
    expect(
      component.graphFacets.find((item) => item.id === "include-me")
        ?.visualState,
    ).toBe("required");
    expect(component.graphConnections).not.toContain(
      jasmine.objectContaining({
        targetId: "include-me",
      }),
    );
  });

  it("always keeps the session root and does not let inspector filters mutate graph topology", () => {
    component.facets = [
      rootFacet(),
      facet("open-facet"),
      {
        ...facet("selected-facet"),
        selection: "positive",
        group: "Selected plan",
        nodeType: "path",
      },
    ];
    component.setFilter("selected");
    component.query = "selected";

    expect(component.visibleFacets.map((item) => item.id)).toEqual([
      "selected-facet",
    ]);
    expect(component.graphFacets.map((item) => item.id)).toEqual([
      "__session__",
      "open-facet",
      "selected-facet",
    ]);
  });

  it("caps a dense plan space by default while keeping every facet searchable and explicitly expandable", () => {
    component.facets = [
      rootFacet(),
      ...Array.from({ length: 100 }, (_, index) => ({
        ...facet(`choice-${index + 1}`),
        label: `Choice ${index + 1}`,
      })),
    ];
    component.inspectedFacetId = undefined;

    expect(component.matchingFacets.length).toBe(100);
    expect(component.visibleFacets.length).toBe(40);
    expect(component.graphFacets.length).toBe(50);
    expect(component.hiddenGraphFacetCount).toBe(51);

    component.query = "Choice 99";
    component.selectFacet("choice-99");

    expect(component.visibleFacets.map((item) => item.id)).toEqual([
      "choice-99",
    ]);
    expect(component.graphFacets.map((item) => item.id)).toContain("choice-99");

    component.query = "";
    component.showMoreFacets();
    component.showMoreGraphFacets();

    expect(component.visibleFacets.length).toBe(80);
    expect(component.graphFacets.length).toBe(100);
    component.showAllFacets();
    component.showAllGraphFacets();
    expect(component.visibleFacets.length).toBe(100);
    expect(component.graphFacets.length).toBe(101);
    expect(component.hiddenGraphFacetCount).toBe(0);

    component.collapseFacetList();
    component.collapseGraphFacets();
    expect(component.visibleFacets.length).toBe(40);
    expect(component.graphFacets.length).toBe(50);
  });

  it("renders every facet when the complete plan space fits below the graph limit", () => {
    component.facets = [
      rootFacet(),
      ...Array.from({ length: 23 }, (_, index) => ({
        ...facet(`choice-${index + 1}`),
        timestep: (index % 4) + 1,
      })),
    ];

    expect(component.graphFacets.length).toBe(24);
    expect(component.hiddenGraphFacetCount).toBe(0);
    expect(component.graphFacets.map((item) => item.id)).toContain("choice-23");
  });

  it("caps large multi-timestep graphs while keeping the full facet list", () => {
    component.facets = [
      rootFacet(),
      ...Array.from({ length: 935 }, (_, index) => ({
        ...facet(`large-choice-${index + 1}`),
        timestep: (index % 24) + 1,
      })),
    ];
    component.inspectedFacetId = undefined;

    expect(component.matchingFacets.length).toBe(935);
    expect(component.graphFacets.length).toBeLessThanOrEqual(50);
    expect(component.hiddenGraphFacetCount).toBeGreaterThan(880);
    expect(
      new Set(
        component.graphFacets
          .filter((item) => item.id !== "__session__")
          .map((item) => item.timestep),
      ).size,
    ).toBe(24);

    component.selectFacet("large-choice-935");

    expect(component.graphFacets.length).toBeLessThanOrEqual(50);
    expect(component.graphFacets.map((item) => item.id)).toContain(
      "large-choice-935",
    );
  });

  it("caps invalid positive dependency facets without hiding their backend state", () => {
    const backendFacets = [
      ...Array.from({ length: 20 }, (_, index) => ({
        ...backendFacet(`plan-${index + 1}`, "positive"),
        timestep: index + 1,
        facetType: "plan" as const,
      })),
      ...Array.from({ length: 867 }, (_, index) => ({
        ...backendFacet(`dependency-${index + 1}`, "positive"),
        timestep: (index % 24) + 1,
        facetType: "implied" as const,
      })),
    ];

    (
      component as unknown as {
        applyBackendFacets: (facets: typeof backendFacets) => void;
      }
    ).applyBackendFacets(backendFacets);

    const dependencies = component.facets.filter(
      (item) => item.facetType === "implied",
    );
    expect(dependencies.length).toBe(867);
    expect(
      dependencies.every((item) => item.selection === "positive"),
    ).toBeTrue();
    expect(component.graphFacets.length).toBeLessThanOrEqual(200);
    expect(component.selectedConstraintCount).toBe(0);
    expect(component.remainingFacetCount).toBe(0);
  });

  it("does not invent a replacement edge when the backend parent is hidden", () => {
    component.facets = [
      rootFacet(),
      {
        ...facet("plan-1"),
        timestep: 1,
        selection: "positive",
        facetType: "plan",
        nodeType: "plan",
      },
      { ...facet("alternative-3"), timestep: 3, parentId: "hidden-2" },
    ];
    component.representativeSolution = [
      {
        ...facet("plan-1"),
        timestep: 1,
        selection: "positive",
        facetType: "plan",
        nodeType: "plan",
        solutionContext: true,
      },
    ];

    expect(component.graphConnections).not.toContain(
      jasmine.objectContaining({
        targetId: "alternative-3",
      }),
    );
  });

  it("explains the boundary between replan alternatives and the forced suffix", () => {
    component.solutionCount = 1;
    component.sessionHorizon = 12;
    component.facets = [
      rootFacet(),
      { ...facet("alternative-7"), timestep: 7 },
    ];
    component.representativeSolution = [
      { ...facet("forced-8"), timestep: 8, solutionContext: true },
    ];

    expect(component.forcedSuffixMessage).toBe(
      "1 plan left. No alternatives after t7.",
    );
  });

  it("distinguishes a neutral displayed action from a user constraint", () => {
    component.facets = [
      { ...facet("plan-1"), facetType: "plan", selection: "neutral" },
    ];
    component.representativeSolution = [
      {
        ...facet("plan-1"),
        facetType: "plan",
        selection: "neutral",
        parentId: "plan-root",
        solutionContext: true,
      },
    ];
    component.inspectedFacetId = "plan-1";

    expect(component.inspectedFacet?.solutionContext).toBeTrue();
    expect(component.inspectedFacet?.parentId).toBe("plan-root");
    expect(
      component.inspectedFacet &&
        component.facetStateLabel(component.inspectedFacet),
    ).toBe("Displayed plan · No constraint");
    expect(component.facetStateLabel(component.facets[0])).toBe(
      "Displayed plan · No constraint",
    );
    expect(
      component.inspectedFacet &&
        component.canClearFacet(component.inspectedFacet),
    ).toBeFalse();
    expect(component.isDisplayedPlanFacet(component.facets[0])).toBeTrue();
    expect(component.isRequiredFacet(component.facets[0])).toBeFalse();
  });

  it("shows pending constraints on a displayed action before Apply", () => {
    component.facets = [
      { ...facet("plan-1"), facetType: "plan", selection: "neutral" },
    ];
    component.representativeSolution = [
      {
        ...facet("plan-1"),
        facetType: "plan",
        selection: "neutral",
        solutionContext: true,
      },
    ];

    component.applyFacetSelection("plan-1", "positive");
    expect(component.facetStateLabel(component.facets[0])).toBe(
      "Displayed plan · Require pending",
    );
    expect(component.isRequiredFacet(component.facets[0])).toBeTrue();
    expect(component.isForbiddenFacet(component.facets[0])).toBeFalse();
    expect(
      component.graphFacets.find((item) => item.id === "plan-1")
        ?.userConstraint,
    ).toBeTrue();
    expect(
      component.graphFacets.find((item) => item.id === "plan-1")?.meta,
    ).toContain("require pending");

    component.applyFacetSelection("plan-1", "negative");
    expect(component.facetStateLabel(component.facets[0])).toBe(
      "Displayed plan · Forbid pending",
    );
    expect(component.isRequiredFacet(component.facets[0])).toBeFalse();
    expect(component.isForbiddenFacet(component.facets[0])).toBeTrue();
    expect(
      component.graphFacets.find((item) => item.id === "plan-1")?.meta,
    ).toContain("forbid pending");
  });

  it("does not count displayed-plan facets as alternatives", () => {
    component.facets = [facet("plan-1"), facet("alternative-1")];
    component.representativeSolution = [
      {
        ...facet("plan-1"),
        solutionContext: true,
      },
    ];

    expect(component.matchingFacets.length).toBe(2);
    expect(component.remainingFacetCount).toBe(1);
    expect(
      component.actionBrowserView.filters.find(
        (filter) => filter.value === "open",
      )?.count,
    ).toBe(1);

    component.setFilter("open");
    expect(component.matchingFacets.map((facet) => facet.id)).toEqual([
      "alternative-1",
    ]);
  });

  it("renders an empty confirmed space with its root instead of an empty canvas", () => {
    service.applyFacets$.and.returnValue(of(mutationResponse([], [], 0)));
    service.query$.and.callFake((_runId, type) =>
      of(
        type === "solution"
          ? {
              runId: "run-1",
              selectionRevision: 0,
              solutionCount: null,
              result: { type: "solution", solutions: [] },
            }
          : {
              runId: "run-1",
              selectionRevision: 0,
              solutionCount: 0,
              result: { type: "solutionCount", value: 0 },
            },
      ),
    );
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();

    expect(component.graphFacets.map((item) => item.id)).toEqual([
      "__session__",
      "include-me",
    ]);
    expect(
      component.facets.find((item) => item.id === "include-me")?.available,
    ).toBeFalse();
  });

  it("does not hide an invalid positive selection on an implied facet", () => {
    service.applyFacets$.and.returnValue(
      of(
        mutationResponse(
          [
            {
              ...backendFacet("implied-by-choice", "positive"),
              facetType: "implied",
              impliedBy: ["include-me"],
            },
          ],
          [],
        ),
      ),
    );
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();

    const implied = component.facets.find(
      (item) => item.id === "implied-by-choice",
    );
    expect(implied?.group).toBe("In every plan");
    expect(implied?.nodeType).toBeUndefined();
    expect(implied?.selection).toBe("positive");
    expect(implied?.selectable).toBeFalse();
    expect(implied && component.facetStateLabel(implied)).toBe(
      "Occurs in every plan",
    );
    expect(implied && component.canRequireFacet(implied)).toBeFalse();
    expect(implied && component.canClearFacet(implied)).toBeFalse();
    expect(implied?.detail).toContain("every remaining plan");
    expect(implied?.detail).not.toContain("unknown plans");
    expect(component.selectedConstraintCount).toBe(1);
  });

  it("allows an any-step choice to be staged and cleared before applying", () => {
    component.facets = [
      rootFacet(),
      {
        ...facet("any-step-action"),
        timestep: 0,
        abstractTimeStep: true,
      },
    ];

    component.applyFacetSelection("any-step-action", "positive");

    expect(component.pendingSelectionEntries).toEqual([
      jasmine.objectContaining({
        facetId: "any-step-action",
        selection: "positive",
        previousSelection: "neutral",
      }),
    ]);
    expect(component.canClearFacet(component.facets[1])).toBeTrue();
    expect(component.timestepLabel(component.facets[1])).toBe("Any step");
    expect(
      component.graphFacets.find((item) => item.id === "any-step-action")?.meta,
    ).toContain("any step");
    expect(
      component.graphFacets.find((item) => item.id === "any-step-action")?.meta,
    ).not.toContain("t0");
  });

  it("adds the confirmed representative solution to the graph after applying", () => {
    service.applyFacets$.and.returnValue(
      of(
        mutationResponse(
          [backendFacet("include-me", "positive")],
          [
            {
              id: "solution-action",
              label: "unstack a b",
              timestep: 3,
              selectionState: "neutral",
            },
          ],
        ),
      ),
    );
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();

    expect(component.representativeSolutionLabel).toBe("solution 1");
    expect(component.representativeSolution.map((item) => item.label)).toEqual([
      "unstack a b",
    ]);
    expect(component.graphFacets.map((item) => item.id)).toContain(
      "solution-action",
    );
    expect(component.graphFacets.map((item) => item.id)).toContain("__goal__");
    expect(component.graphConnections).toContain(
      jasmine.objectContaining({
        sourceId: "solution-action",
        targetId: "__goal__",
        kind: "plan",
      }),
    );
  });

  it("loads another concrete plan without changing the active constraints", () => {
    component.solutionCount = 3;
    component.currentSolutionNumber = 1;
    component.solutionCache[1] = {
      label: "Initial planner plan",
      facets: [{ ...facet("original-plan-action"), solutionContext: true }],
    };
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: null,
        result: {
          type: "solution",
          solutions: [
            {
              label: "solution 2",
              facets: [
                {
                  id: "second-plan-action",
                  label: "pick-up c",
                  timestep: 4,
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      }),
    );

    component.showSolution(2);

    expect(service.query$).toHaveBeenCalledWith("run-1", "solution", 2);
    expect(component.currentSolutionNumber).toBe(2);
    expect(component.representativeSolutionLabel).toBe("solution 2");
    expect(component.representativeSolution.map((item) => item.label)).toEqual([
      "pick-up c",
    ]);
    expect(component.facets.map((item) => item.id)).toEqual([
      "include-me",
      "exclude-me",
    ]);

    component.showSolution(1);

    expect(service.query$).toHaveBeenCalledTimes(1);
    expect(component.representativeSolutionLabel).toBe("Initial planner plan");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "original-plan-action",
    ]);
  });

  it("uses the concrete PlanPilot solution for bounded sessions", () => {
    component.facets = [
      rootFacet(),
      {
        ...facet("planner-1"),
        timestep: 1,
        selection: "positive",
        facetType: "plan",
        nodeType: "plan",
      },
      {
        ...facet("planner-8"),
        timestep: 8,
        selection: "positive",
        facetType: "plan",
        nodeType: "plan",
      },
    ];
    (
      component as unknown as {
        applySessionSummary: (response: PlanPilotFacetListResponse) => void;
      }
    ).applySessionSummary({
      runId: "run-1",
      selectionRevision: 0,
      solutionCount: 9,
      solution: {
        label: "solution 1",
        facets: [
          backendFacet("planner-1", "positive"),
          { ...backendFacet("detour-10", "positive"), timestep: 10 },
        ],
      },
      facets: [],
    });

    expect(component.representativeSolutionLabel).toBe("solution 1");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "planner-1",
      "detour-10",
    ]);
    expect(component.representativeSolution.length).toBe(2);
    expect(
      component.graphFacets.find((item) => item.id === "__goal__")?.timestep,
    ).toBe(11);
  });

  it("does not hide a returned bounded solution when the initial planner path is empty", () => {
    component.sessionEncoding = "bounded";
    component.facets = [rootFacet(), facet("optional-detour")];
    (
      component as unknown as {
        applySessionSummary: (response: PlanPilotFacetListResponse) => void;
      }
    ).applySessionSummary({
      runId: "run-1",
      selectionRevision: 0,
      solutionCount: 3233,
      solution: {
        label: "solution 1",
        facets: [backendFacet("enumerated-detour", "positive")],
      },
      facets: [backendFacet("optional-detour", "neutral")],
    });

    expect(component.representativeSolutionLabel).toBe("solution 1");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "enumerated-detour",
    ]);
  });

  it("preserves backend topology for bounded solutions without inventing idle actions or parents", () => {
    component.sessionEncoding = "bounded";
    const toSolution = component as unknown as {
      toRepresentativeSolution: (
        facets: ReturnType<typeof backendFacet>[],
      ) => typeof component.representativeSolution;
    };

    const result = toSolution.toRepresentativeSolution([
      { ...backendFacet("action-1", "positive"), timestep: 1 },
      { ...backendFacet("action-3", "positive"), timestep: 3 },
    ]);

    expect(result.map((item) => item.id)).toEqual(["action-1", "action-3"]);
    expect(result[0].parentId).toBeUndefined();
    expect(result[1].parentId).toBeUndefined();
    component.facets = [rootFacet()];
    component.representativeSolution = result;
    expect(component.totalGraphDomainFacetCount).toBe(2);
    expect(component.hiddenGraphFacetCount).toBe(0);
    expect(
      component.graphConnections.filter(
        (edge) => edge.sourceId === "__session__",
      ),
    ).toEqual([
      { sourceId: "__session__", targetId: "action-1", kind: "plan" },
    ]);
    expect(component.buildGraphDiagnostic().integrity.issues).toContain(
      "Representative solution facet has no incoming connection: action-3",
    );
  });

  it("matches the fixed backend graph contract and arrow directions", () => {
    const bridge = component as unknown as {
      applyBackendFacets: (facets: PlanPilotFacet[]) => void;
      toRepresentativeSolution: (
        facets: PlanPilotFacet[],
      ) => typeof component.representativeSolution;
    };

    bridge.applyBackendFacets(PLANPILOT_GRAPH_CONTRACT.facets);
    component.representativeSolution = bridge.toRepresentativeSolution(
      PLANPILOT_GRAPH_CONTRACT.solution,
    );

    expect(component.graphConnections).toEqual(
      PLANPILOT_GRAPH_CONTRACT.expectedConnections,
    );
    expect(component.graphFacets.map((facet) => facet.id)).toContain(
      "__session__",
    );
    expect(component.graphFacets.map((facet) => facet.id)).toContain(
      "__goal__",
    );
    expect(component.graphConnections).not.toContain(
      jasmine.objectContaining({
        sourceId: "stack-a-b-t3",
        targetId: "pick-a-t1",
      }),
    );
    const diagnostic = component.buildGraphDiagnostic();
    expect(diagnostic.integrity.issues).toEqual([]);
    expect(diagnostic.connections).toContain(
      jasmine.objectContaining({
        sourceId: "stack-a-b-t3",
        targetId: "move-c-t5",
        gapTimesteps: [4],
        label: "t4 empty",
      }),
    );
    expect(Array.isArray(diagnostic.applicationAssets)).toBeTrue();
    expect(diagnostic.session["currentSolutionNumber"]).toBe(0);
  });

  it("does not silently repair a wrong parent returned by the backend", () => {
    const toSolution = component as unknown as {
      toRepresentativeSolution: (
        facets: PlanPilotFacet[],
      ) => typeof component.representativeSolution;
    };
    component.facets = [rootFacet()];
    component.representativeSolution = toSolution.toRepresentativeSolution([
      {
        id: "action-1",
        label: "action 1",
        timestep: 1,
        selectionState: "positive",
        facetType: "plan",
        parentId: "action-2",
      },
      {
        id: "action-2",
        label: "action 2",
        timestep: 2,
        selectionState: "positive",
        facetType: "plan",
      },
    ]);

    expect(component.representativeSolution[0].parentId).toBe("action-2");
    expect(component.graphConnections).not.toContain(
      jasmine.objectContaining({
        sourceId: "action-1",
        targetId: "action-2",
      }),
    );
    expect(component.buildGraphDiagnostic().integrity.issues).toContain(
      "Facet parent is not earlier: action-2 -> action-1",
    );
  });

  it("keeps the confirmed plan visible when an optional count fails", () => {
    component.representativeSolutionLabel = "solution 1";
    component.representativeSolution = [
      { ...facet("confirmed-action"), solutionContext: true },
    ];
    service.query$.and.returnValue(
      throwError(() => new Error("FASB count timed out")),
    );

    component.loadSolutionCount();

    expect(component.solutionCountKnown).toBeFalse();
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "confirmed-action",
    ]);
    expect(component.solutionCountError).toContain("Plan count unavailable");
    expect(component.backendError).toBeUndefined();
  });

  it("explains that a count timeout does not break the graph", () => {
    service.query$.and.returnValue(
      throwError(() => ({
        status: 503,
        error: { code: "PLAN_SPACE_TOO_LARGE" },
      })),
    );

    component.loadSolutionCount();

    expect(component.solutionCountKnown).toBeFalse();
    expect(component.solutionCountError).toContain(
      "You can still browse plans",
    );
  });

  it("stores a successful explicit count without requesting the plan again", () => {
    component.representativeSolution = [
      { ...facet("confirmed-action"), solutionContext: true },
    ];
    component.solutionCache[1] = {
      label: "solution 1",
      facets: [{ ...facet("confirmed-action"), solutionContext: true }],
    };
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 60,
        result: { type: "solutionCount", value: 60 },
      }),
    );

    component.loadSolutionCount();

    expect(service.query$).toHaveBeenCalledOnceWith("run-1", "solutionCount");
    expect(component.solutionCountKnown).toBeTrue();
    expect(component.solutionCount).toBe(60);
    expect(component.representativeSolution[0].remainingSolutions).toBe(60);
    expect(component.solutionCache[1].facets[0].remainingSolutions).toBe(60);
  });

  it("reloads the session instead of applying a count from an older revision", () => {
    const response = new Subject<PlanPilotQueryResponse>();
    service.query$.and.returnValue(response);
    service.listFacets$.calls.reset();

    component.loadSolutionCount();
    response.next({
      runId: "run-1",
      selectionRevision: 1,
      solutionCount: 60,
      result: { type: "solutionCount", value: 60 },
    });

    expect(component.solutionCountKnown).toBeFalse();
    expect(component.lastSelectionMessage).toContain("another window");
    expect(service.listFacets$).toHaveBeenCalledOnceWith("run-1");
  });

  it("marks the complete returned solution path, including the root edge, as plan edges", () => {
    component.facets = [
      rootFacet(),
      { ...facet("solution-1"), timestep: 1 },
      { ...facet("solution-2"), timestep: 2 },
    ];
    component.solutionCount = 1;
    component.solutionCountKnown = true;
    component.representativeSolution = [
      {
        ...facet("solution-1"),
        timestep: 1,
        selection: "positive",
        solutionContext: true,
      },
      {
        ...facet("solution-2"),
        timestep: 2,
        selection: "positive",
        solutionContext: true,
        parentId: "solution-1",
      },
    ];

    expect(component.graphConnections).toContain({
      sourceId: "__session__",
      targetId: "solution-1",
      kind: "plan",
    });
    expect(component.graphConnections).toContain({
      sourceId: "solution-1",
      targetId: "solution-2",
      kind: "plan",
    });
  });

  it("does not launch another count after a total is known", () => {
    component.solutionCountKnown = true;
    component.solutionCount = 2;
    service.query$.calls.reset();

    component.loadSolutionCount();

    expect(service.query$).not.toHaveBeenCalled();
  });

  it("uses the exact PlanPilot solution instead of the shorter planner path", () => {
    component.sessionEncoding = "exact";
    component.sessionHorizon = 10;
    component.facets = [
      rootFacet(),
      ...Array.from({ length: 8 }, (_, index) => ({
        ...facet(`planner-${index + 1}`),
        timestep: index + 1,
        selection: "positive" as const,
        facetType: "plan" as const,
        nodeType: "plan" as const,
      })),
    ];
    const exactFacets = Array.from({ length: 10 }, (_, index) => ({
      ...backendFacet(`exact-${index + 1}`, "positive"),
      timestep: index + 1,
    }));
    (
      component as unknown as {
        applySessionSummary: (response: PlanPilotFacetListResponse) => void;
      }
    ).applySessionSummary({
      runId: "run-1",
      selectionRevision: 0,
      solutionCount: 2,
      solution: { label: "solution 1", facets: exactFacets },
      facets: [],
    });

    expect(component.representativeSolutionLabel).toBe("solution 1");
    expect(component.representativeSolution.length).toBe(10);
    expect(
      component.graphFacets.find((item) => item.id === "__goal__")?.timestep,
    ).toBe(11);
  });

  it("locks document scrolling only while fullscreen is active", () => {
    document.body.style.overflow = "auto";

    component.toggleCanvasExpanded();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.classList).toContain("planpilot-fullscreen-open");

    component.exitFullscreenWithEscape();
    expect(component.canvasExpanded).toBeFalse();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.body.classList).not.toContain("planpilot-fullscreen-open");
  });

  it("accepts exact and bounded encodings and keeps the horizon in the supported range", () => {
    component.updateSessionEncoding({
      target: { value: "exact" },
    } as unknown as Event);
    component.updateSessionHorizon({
      target: { value: "250" },
    } as unknown as Event);

    expect(component.sessionEncoding).toBe("exact");
    expect(component.sessionHorizon).toBe(100);

    component.updateSessionEncoding({
      target: { value: "bounded" },
    } as unknown as Event);
    component.updateSessionHorizon({
      target: { value: "0" },
    } as unknown as Event);

    expect(component.sessionEncoding).toBe("bounded");
    expect(component.sessionHorizon).toBe(1);
  });

  it("keeps draft settings separate from the active graph settings", () => {
    component.sessionStatus = "ready";
    component.activeSessionEncoding = "bounded";
    component.activeSessionHorizon = 10;
    component.sessionEncoding = "exact";
    component.sessionHorizon = 30;

    expect(component.displayedSessionEncoding).toBe("bounded");
    expect(component.displayedSessionHorizon).toBe(10);
  });

  it("keeps the working session when replacement settings fail", () => {
    component.activeSessionEncoding = "bounded";
    component.activeSessionHorizon = 10;
    component.sessionEncoding = "exact";
    component.sessionHorizon = 30;
    component.sessionProject = project("project-1") as never;
    component.representativeSolution = [
      { ...facet("working"), solutionContext: true },
    ];
    service.startSession$.and.returnValue(
      throwError(() => ({
        error: { code: "PLAN_SPACE_TOO_LARGE", message: "slow" },
      })),
    );

    component.applySessionConfiguration();

    expect(component.runId).toBe("run-1");
    expect(component.sessionStatus).toBe("ready");
    expect(component.displayedSessionEncoding).toBe("bounded");
    expect(component.displayedSessionHorizon).toBe(10);
    expect(component.representativeSolution[0].id).toBe("working");
    expect(service.stopSession$).not.toHaveBeenCalledWith("run-1");
  });

  it("does not rebuild the plan space while facet changes are staged", () => {
    component.sessionProject = project("project-1") as never;
    component.activeSessionHorizon = 1;
    component.sessionHorizon = 2;
    component.applyFacetSelection("include-me", "positive");

    component.applySessionConfiguration();

    expect(component.pendingSelectionCount).toBe(1);
    expect(service.startSession$).not.toHaveBeenCalled();
  });

  it("clears selections from the old run after replacing its settings", () => {
    component.sessionProject = project("project-1") as never;
    component.activeSessionHorizon = 1;
    component.sessionHorizon = 2;
    component.applyFacetSelection("include-me", "positive");
    component.activePinnedFacets["old-pinned"] = facet("old-pinned");
    component.knownFacets["old-known"] = facet("old-known");
    component.inspectedFacetId = "old-pinned";
    service.startSession$.and.returnValue(
      of(sessionResponse("replacement-run")),
    );

    component.discardStagedSelections();
    component.applySessionConfiguration();

    expect(component.runId).toBe("replacement-run");
    expect(component.pendingSelectionCount).toBe(0);
    expect(component.activePinnedFacets).toEqual({});
    expect(component.knownFacets).toEqual({});
    expect(component.inspectedFacetId).toBeUndefined();
    expect(
      component.facets.some((item) => item.id.startsWith("old-")),
    ).toBeFalse();
    expect(service.stopSession$).toHaveBeenCalledWith("run-1");
  });

  it("builds a self-contained diagnostic without dropping backend facets", () => {
    component.sessionHorizon = 30;
    component.sessionEncoding = "exact";
    component.sessionAbstractTimeSteps = true;
    component.activeSessionHorizon = 12;
    component.activeSessionEncoding = "bounded";
    component.activeSessionAbstractTimeSteps = false;
    component.facets = [
      rootFacet(),
      {
        ...facet("path-1"),
        selection: "positive",
        nodeType: "path",
        group: "Selected plan",
      },
      { ...facet("branch-2"), timestep: 2, parentId: "path-1" },
    ];
    component.graph = {
      exportSnapshot: () => ({
        viewport: { width: 800, height: 600, zoom: 1, pan: { x: 0, y: 0 } },
        imagePngDataUrl: "data:image/png;base64,test",
        nodes: [],
        edges: [],
      }),
    } as unknown as typeof component.graph;

    const diagnostic = component.buildGraphDiagnostic();

    expect(diagnostic.schemaVersion).toBe(
      "ipexco-planpilot-graph-diagnostic-v4",
    );
    expect(diagnostic.integrity.backendFacetCount).toBe(2);
    expect(diagnostic.integrity.graphFacetCount).toBe(2);
    expect(diagnostic.integrity.issues).toEqual([]);
    expect(diagnostic.integrity.omittedFacetIds).toEqual([]);
    expect(diagnostic.facets.map((item) => item.id)).toEqual([
      "path-1",
      "branch-2",
    ]);
    expect(diagnostic.connections).toEqual([]);
    expect(diagnostic.ui["connectionModel"]).toBe(
      "representative-solution-only",
    );
    expect(diagnostic.session["horizon"]).toBe(12);
    expect(diagnostic.session["encoding"]).toBe("bounded");
    expect(diagnostic.session["abstractTimeSteps"]).toBeFalse();
    expect(diagnostic.session["solutionCount"]).toBeNull();
    expect(diagnostic.session["solutionCountKnown"]).toBeFalse();
    expect(diagnostic.renderedGraph?.imagePngDataUrl).toContain(
      "data:image/png",
    );
  });

  it("reports a same-timestep parent and the resulting orphan solution facet", () => {
    component.facets = [
      rootFacet(),
      { ...facet("solution-a"), timestep: 2 },
      { ...facet("solution-b"), timestep: 2 },
    ];
    component.representativeSolution = [
      {
        ...facet("solution-a"),
        timestep: 2,
        selection: "positive",
        solutionContext: true,
      },
      {
        ...facet("solution-b"),
        timestep: 2,
        selection: "positive",
        solutionContext: true,
        parentId: "solution-a",
      },
    ];

    const diagnostic = component.buildGraphDiagnostic();

    expect(diagnostic.integrity.issues).toContain(
      "Facet parent is not earlier: solution-a -> solution-b",
    );
    expect(diagnostic.integrity.issues).toContain(
      "Representative solution facet has no incoming connection: solution-b",
    );
  });

  it("reports a missing parent and a missing root connection", () => {
    component.facets = [rootFacet()];
    component.representativeSolution = [
      {
        ...facet("orphan"),
        timestep: 2,
        selection: "positive",
        solutionContext: true,
        parentId: "missing-parent",
      },
    ];

    const diagnostic = component.buildGraphDiagnostic();

    expect(diagnostic.integrity.issues).toContain(
      "Facet parent is missing from graph: orphan -> missing-parent",
    );
    expect(diagnostic.integrity.issues).toContain(
      "Representative solution facet has no incoming connection: orphan",
    );
  });

  it("refreshes the representative solution only after reset facets arrive", () => {
    const listedFacets = new Subject<PlanPilotFacetListResponse>();
    service.listFacets$.and.returnValue(listedFacets);
    service.query$.calls.reset();

    component.resetSessionView();

    expect(service.query$).not.toHaveBeenCalled();
    listedFacets.next({
      runId: "run-1",
      selectionRevision: 1,
      solutionCount: 1,
      solution: {
        label: "solution 1",
        facets: [backendFacet("restored", "positive")],
      },
      facets: [backendFacet("restored", "positive")],
    });
    listedFacets.complete();

    expect(service.query$).not.toHaveBeenCalled();
    expect(component.representativeSolutionLabel).toBe("solution 1");
  });

  it("clears local history and reloads facets when clear all conflicts", () => {
    component.facets = [
      {
        ...facet("active"),
        selection: "positive",
        facetType: "selected",
      },
    ];
    component.undoStack = [{ label: "old undo", changes: [] }];
    component.redoStack = [{ label: "old redo", changes: [] }];
    service.applyFacets$.and.returnValue(
      throwError(() => ({
        status: 409,
        error: { code: "SELECTION_CONFLICT" },
      })),
    );

    component.resetSessionView();

    expect(component.undoStack).toEqual([]);
    expect(component.redoStack).toEqual([]);
    expect(component.pendingSelectionCount).toBe(0);
    expect(component.backendError).toBeUndefined();
    expect(component.lastSelectionMessage).toContain("History was cleared");
    expect(service.listFacets$).toHaveBeenCalledWith("run-1");
  });

  it("loads and caches separate Require and Forbid impact values on demand", () => {
    service.selectionImpact$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 60,
        result: {
          type: "selectionImpact",
          facetId: "include-me",
          exact: true,
          comparableToCurrent: true,
          totalPlans: 60,
          require: {
            available: true,
            plansRemaining: 15,
            planReduction: 0.75,
          },
          forbid: {
            available: true,
            plansRemaining: 45,
            planReduction: 0.25,
          },
        },
      }),
    );
    component.inspectedFacetId = "include-me";

    component.calculateImpact();

    expect(service.selectionImpact$).toHaveBeenCalledOnceWith(
      "run-1",
      "include-me",
    );
    expect(component.solutionCount).toBe(60);
    expect(component.inspectedFacetImpact?.require).toEqual({
      available: true,
      planReduction: 0.75,
      plansRemaining: 15,
      facetReduction: null,
      facetsRemaining: null,
    });
    expect(component.selectedActionView?.forbidImpact).toEqual({
      available: true,
      totalPlans: 60,
      plansRemaining: 45,
      plansRemoved: 15,
      reductionPercent: 25,
    });

    component.calculateImpact();
    expect(service.selectionImpact$).toHaveBeenCalledTimes(1);
  });

  it("allows a separate impact preview after another action was inspected", () => {
    service.selectionImpact$.and.callFake((_runId, facetId) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 2,
        result: {
          type: "selectionImpact",
          facetId,
          exact: true,
          comparableToCurrent: true,
          totalPlans: 2,
          require: {
            available: true,
            plansRemaining: 1,
            planReduction: 0.5,
          },
          forbid: {
            available: true,
            plansRemaining: 1,
            planReduction: 0.5,
          },
        },
      }),
    );
    component.inspectedFacetId = "include-me";
    component.calculateImpact();

    component.inspectedFacetId = "exclude-me";
    expect(component.impactCalculated).toBeFalse();
    component.calculateImpact();

    expect(service.selectionImpact$.calls.allArgs()).toEqual([
      ["run-1", "include-me"],
      ["run-1", "exclude-me"],
    ]);
    expect(component.inspectedFacetImpact).toBeDefined();
  });

  it("previews a fixed displayed action without sending an invalid solver query", () => {
    component.solutionCount = 12;
    component.solutionCountKnown = true;
    component.facets = [
      {
        ...facet("fixed-action"),
        facetType: "plan",
        selectable: false,
      },
    ];
    component.representativeSolution = [
      {
        ...facet("fixed-action"),
        facetType: "plan",
        solutionContext: true,
      },
    ];
    component.inspectedFacetId = "fixed-action";
    service.selectionImpact$.calls.reset();

    component.calculateImpact();

    expect(service.selectionImpact$).not.toHaveBeenCalled();
    expect(component.selectedActionView?.canPreviewImpact).toBeTrue();
    expect(component.selectedActionView?.canRequire).toBeFalse();
    expect(component.selectedActionView?.canForbid).toBeFalse();
    expect(component.selectedActionView?.requireImpact).toEqual({
      available: true,
      totalPlans: 12,
      plansRemaining: 12,
      plansRemoved: 0,
      reductionPercent: 0,
    });
    expect(component.selectedActionView?.forbidImpact).toEqual({
      available: false,
      totalPlans: 12,
      plansRemaining: 0,
      plansRemoved: 12,
      reductionPercent: 100,
    });
  });

  it("previews fixed-action availability when the exact count is unknown", () => {
    component.facets = [
      {
        ...facet("fixed-action"),
        facetType: "plan",
        selectable: false,
      },
    ];
    component.representativeSolution = [
      { ...facet("fixed-action"), solutionContext: true },
    ];
    component.inspectedFacetId = "fixed-action";

    component.calculateImpact();

    expect(component.selectedActionView?.requireImpact?.available).toBeTrue();
    expect(
      component.selectedActionView?.requireImpact?.plansRemaining,
    ).toBeNull();
    expect(component.selectedActionView?.forbidImpact?.available).toBeFalse();
    expect(component.impactNotice).toContain("exact plan count");
  });

  it("updates a cached fixed-action preview when the exact count arrives", () => {
    component.facets = [
      {
        ...facet("fixed-action"),
        facetType: "plan",
        selectable: false,
      },
    ];
    component.representativeSolution = [
      { ...facet("fixed-action"), solutionContext: true },
    ];
    component.inspectedFacetId = "fixed-action";
    component.calculateImpact();
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 12,
        result: { type: "solutionCount", value: 12 },
      }),
    );

    component.loadSolutionCount();

    expect(component.facetImpacts["fixed-action"].exact).toBeTrue();
    expect(component.facetImpacts["fixed-action"].require.plansRemaining).toBe(
      12,
    );
    expect(component.facetImpacts["fixed-action"].forbid.plansRemaining).toBe(
      0,
    );
    expect(component.impactNotice).toBe("");
  });

  it("shows availability when targeted exact impact exceeds its deadline", () => {
    const response = new Subject<PlanPilotQueryResponse>();
    service.selectionImpact$.and.returnValue(response);
    component.inspectedFacetId = "include-me";

    component.calculateImpact();

    expect(service.selectionImpact$).toHaveBeenCalledOnceWith(
      "run-1",
      "include-me",
    );
    response.next({
      runId: "run-1",
      selectionRevision: 0,
      solutionCount: null,
      result: {
        type: "selectionImpact",
        facetId: "include-me",
        exact: false,
        comparableToCurrent: true,
        totalPlans: null,
        require: {
          available: true,
          plansRemaining: null,
          planReduction: null,
        },
        forbid: {
          available: false,
          plansRemaining: null,
          planReduction: null,
        },
      },
    });
    response.complete();

    expect(component.facetImpacts["include-me"].require.available).toBeTrue();
    expect(component.facetImpacts["include-me"].forbid.available).toBeFalse();
    expect(component.impactNotice).toContain("Availability is shown");
  });

  it("keeps the current plan usable when impact calculation fails", () => {
    component.representativeSolution = [
      { ...facet("shown"), solutionContext: true },
    ];
    service.selectionImpact$.and.returnValue(
      throwError(() => ({
        error: { code: "PLAN_SPACE_TOO_LARGE", message: "slow" },
      })),
    );
    component.inspectedFacetId = "include-me";

    component.calculateImpact();

    expect(component.impactError).toContain("did not finish in time");
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "shown",
    ]);
    expect(component.sessionStatus).toBe("ready");
    expect(component.impactLoading).toBeFalse();
  });

  it("filters the action list by timestep without changing graph topology", () => {
    component.activeSessionHorizon = 3;
    component.facets = [
      rootFacet(),
      { ...facet("at-1"), timestep: 1 },
      { ...facet("at-2"), timestep: 2 },
      { ...facet("any"), timestep: 0, abstractTimeStep: true },
    ];
    component.representativeSolution = [
      { ...facet("at-1"), timestep: 1, solutionContext: true },
      {
        ...facet("at-2"),
        timestep: 2,
        solutionContext: true,
        parentId: "at-1",
      },
    ];
    const connectionsBefore = component.graphConnections;

    component.showActionsAtTimestep(2);

    expect(component.matchingFacets.map((item) => item.id)).toEqual(["at-2"]);
    expect(component.graphConnections).toEqual(connectionsBefore);
    expect(component.timelineRows.map((row) => row.label)).toEqual([
      "t1",
      "t2",
      "t3",
      "Any step",
    ]);
    expect(component.timelineRows[2].displayedActions).toEqual([]);

    component.showActionsAtTimestep("any");
    expect(component.matchingFacets.map((item) => item.id)).toEqual(["any"]);
    expect(
      component.matchingFacets.map((item) => component.timestepLabel(item)),
    ).toEqual(["Any step"]);
  });

  it("focuses a timeline row in the graph without silently changing the action filter", () => {
    const graph = jasmine.createSpyObj("PlanPilotGraphComponent", [
      "focusTimestep",
    ]);
    component.graph = graph;
    component.activeTimestep = 1;

    component.focusTimelineTimestep(2);

    expect(graph.focusTimestep).toHaveBeenCalledOnceWith(2);
    expect(component.focusedTimestep).toBe(2);
    expect(component.activeTimestep).toBe(1);
    expect(component.activeSidebarSection).toBe("browse");
  });

  it("does not count unavailable pinned context as timeline actions", () => {
    component.facets = [
      { ...facet("available-at-2"), timestep: 2, available: true },
      {
        ...facet("pinned-outside-space"),
        timestep: 2,
        available: false,
        selection: "positive",
      },
    ];

    expect(component.timestepActionCounts).toEqual({ 2: 1 });
  });

  it("opens the explicit timeline filter in Actions and clears it completely", () => {
    component.activeSidebarSection = "timeline";

    component.showActionsAtTimestep("any");

    expect(component.activeSidebarSection).toBe("browse");
    expect(component.activeTimestep).toBe("any");

    component.clearTimestepFilter();
    expect(component.activeTimestep).toBeNull();
  });

  it("switches sidebar sections without scrolling the whole inspector", () => {
    expect(component.activeSidebarSection).toBe("browse");

    component.showSidebarSection("timeline");

    expect(component.activeSidebarSection).toBe("timeline");
  });

  it("keeps action details inline without changing the active sidebar section", () => {
    component.facets = [facet("choice")];
    component.activeSidebarSection = "browse";

    component.selectFacet("choice");

    expect(component.inspectedFacetId).toBe("choice");
    expect(component.activeSidebarSection).toBe("browse");
  });

  it("does not navigate when an action is selected from the graph", () => {
    component.facets = [facet("choice")];
    component.activeSidebarSection = "plans";

    component.selectFacetFromGraph({ facetId: "choice", x: 20, y: 30 });

    expect(component.inspectedFacetId).toBe("choice");
    expect(component.activeSidebarSection).toBe("plans");
  });

  it("supports arrow, Home, and End navigation across the three sidebar tabs", () => {
    const right = new KeyboardEvent("keydown", { key: "ArrowRight" });
    const end = new KeyboardEvent("keydown", { key: "End" });
    const home = new KeyboardEvent("keydown", { key: "Home" });

    component.handleSidebarTabKey(right, "timeline");
    expect(component.activeSidebarSection).toBe("browse");
    component.handleSidebarTabKey(end, "browse");
    expect(component.activeSidebarSection).toBe("plans");
    component.handleSidebarTabKey(home, "plans");
    expect(component.activeSidebarSection).toBe("timeline");
  });

  it("loads authoritative concrete and Any-step required actions as read-only", () => {
    service.query$.calls.reset();
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: null,
        result: {
          type: "impliedFacets",
          facets: [
            {
              id: "include-me",
              label: "include-me",
              timestep: 1,
              selectionState: "neutral",
              facetType: "implied",
              selectable: false,
            },
            {
              id: "any-required",
              label: "pick-up a",
              timestep: null,
              selectionState: "neutral",
              facetType: "implied",
              selectable: false,
              abstractTimeStep: true,
            },
          ],
        },
      }),
    );

    component.loadRequiredActions();

    expect(service.query$).toHaveBeenCalledOnceWith("run-1", "impliedFacets");
    expect(component.requiredActions.map((item) => item.id)).toEqual([
      "include-me",
      "any-required",
    ]);
    expect(
      component.requiredActions.every((item) => item.selectable === false),
    ).toBeTrue();
    expect(component.timestepLabel(component.requiredActions[1])).toBe(
      "Any step",
    );
  });

  it("loads one page and can display and compare plans above twenty", () => {
    component.solutionCount = 30;
    component.solutionCountKnown = true;
    component.currentSolutionNumber = 1;
    component.representativeSolution = [
      { ...facet("displayed"), solutionContext: true },
    ];
    component.solutionCache[1] = {
      label: "solution 1",
      facets: [
        {
          ...facet("move-a"),
          label: "move a",
          action: "move",
          actionArguments: ["a"],
          solutionContext: true,
        },
      ],
    };
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 30,
        result: {
          type,
          solutions: [
            {
              label: `solution ${number}`,
              facets: [
                {
                  id: `move-${number}`,
                  label: number === 2 ? "move a" : `action ${number}`,
                  action: {
                    name: number === 2 ? "move" : "action",
                    arguments: number === 2 ? ["a"] : [String(number)],
                  },
                  timestep: number === 2 ? 2 : (number ?? 1),
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      }),
    );

    component.loadPlanPage(1);

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      5, 4, 3, 2,
    ]);
    expect(component.loadedPlanNumbers).toEqual([1, 2, 3, 4, 5]);
    expect(component.planPageEnd).toBe(5);
    expect(component.planPageSummaries.length).toBe(5);

    service.query$.calls.reset();
    component.comparisonPlanA = 1;
    component.comparisonPlanB = 2;
    component.compareSelectedPlans();

    expect(service.query$).not.toHaveBeenCalled();
    expect(component.comparison?.moved).toEqual([
      { label: "move a", from: 1, to: 2 },
    ]);
    expect(component.currentSolutionNumber).toBe(1);
    expect(component.representativeSolution.map((item) => item.id)).toEqual([
      "displayed",
    ]);

    service.query$.calls.reset();
    component.showSolution(21);
    component.updateComparisonPlan(
      { target: { value: "21" } } as unknown as Event,
      "b",
    );
    expect(service.query$).toHaveBeenCalledOnceWith("run-1", "solution", 21);
    expect(component.currentSolutionNumber).toBe(21);
    expect(component.comparisonPlanB).toBe(21);
  });

  it("moves between plan pages and retries only a failed plan", () => {
    component.solutionCount = 12;
    component.solutionCountKnown = true;
    let planSevenFails = true;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) => {
      if (number === 7 && planSevenFails) {
        return throwError(() => new Error("temporary failure"));
      }
      return of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 12,
        result: {
          type,
          solutions: [
            {
              label: `solution ${number}`,
              facets: [
                {
                  id: `action-${number}`,
                  label: `action ${number}`,
                  timestep: number ?? 1,
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      });
    });

    component.loadPlanPage(6);

    expect(component.planPageStart).toBe(6);
    expect(component.loadedPlanNumbers).toEqual([6, 8, 9, 10]);
    expect(component.planPageError).toContain("Plan 7");

    service.query$.calls.reset();
    planSevenFails = false;
    component.loadPlanPage();

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([7]);
    expect(component.loadedPlanNumbers).toEqual([6, 7, 8, 9, 10]);
    expect(component.planPageError).toBe("");

    service.query$.calls.reset();
    component.nextPlanPage();
    expect(component.planPageStart).toBe(11);
    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      12, 11,
    ]);

    service.query$.calls.reset();
    component.previousPlanPage();
    expect(component.planPageStart).toBe(6);
    expect(service.query$).not.toHaveBeenCalled();
  });

  it("stops a page load when its highest plan cannot prepare the prefix", () => {
    component.solutionCount = 12;
    component.solutionCountKnown = true;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, _type, number) =>
      number === 10
        ? throwError(() => new Error("preparation timed out"))
        : of({
            runId: "run-1",
            selectionRevision: 0,
            solutionCount: 12,
            result: { type: "solution", solutions: [] },
          }),
    );

    component.loadPlanPage(6);

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([10]);
    expect(component.planPageError).toContain("Plan 10");
    expect(component.planPageLoading).toBeFalse();
  });

  it("jumps to the containing page and displays the requested plan", () => {
    component.solutionCount = 60;
    component.solutionCountKnown = true;
    component.currentSolutionNumber = 0;
    component.comparisonPlanB = 23;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 60,
        result: {
          type,
          solutions: [
            {
              label: `solution ${number}`,
              facets: [
                {
                  id: `action-${number}`,
                  label: `action ${number}`,
                  timestep: number ?? 1,
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      }),
    );

    component.jumpToSolution(23);

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      25, 24, 23, 22, 21,
    ]);
    expect(component.planPageStart).toBe(21);
    expect(component.loadedPlanNumbers).toEqual([21, 22, 23, 24, 25]);
    expect(component.currentSolutionNumber).toBe(23);
    expect(component.representativeSolution[0].id).toBe("action-23");
    expect(component.comparisonPlanB).toBe(23);

    service.query$.calls.reset();
    component.jumpToSolution(61);
    expect(service.query$).not.toHaveBeenCalled();
  });

  it("opens a numbered plan without counting the whole plan space first", () => {
    component.solutionCount = 0;
    component.solutionCountKnown = false;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: null,
        result: {
          type,
          solutions: [
            {
              label: `solution ${number}`,
              facets: [
                {
                  id: `action-${number}`,
                  label: `action ${number}`,
                  timestep: number ?? 1,
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      }),
    );

    component.jumpToSolution(23);

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      25, 24, 23, 22, 21,
    ]);
    expect(component.currentSolutionNumber).toBe(23);
    expect(component.planPageStart).toBe(21);
    expect(component.knownPlanLowerBound).toBe(25);
  });

  it("fills the final partial page when its highest unknown plan is unavailable", () => {
    component.solutionCount = 0;
    component.solutionCountKnown = false;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: number === 25 ? 24 : null,
        result: {
          type,
          solutions:
            number === 25
              ? []
              : [
                  {
                    label: `solution ${number}`,
                    facets: [
                      {
                        id: `action-${number}`,
                        label: `action ${number}`,
                        timestep: number ?? 1,
                        selectionState: "neutral",
                      },
                    ],
                  },
                ],
        },
      }),
    );

    component.jumpToSolution(23);

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      25, 24, 23, 22, 21,
    ]);
    expect(component.solutionCount).toBe(24);
    expect(component.loadedPlanNumbers).toEqual([21, 22, 23, 24]);
    expect(component.currentSolutionNumber).toBe(23);
  });

  it("defaults to two different comparison plans while the count is unknown", () => {
    component.solutionCount = 0;
    component.solutionCountKnown = false;
    const analysisState = component as unknown as {
      invalidateAnalysisState: () => void;
    };

    analysisState.invalidateAnalysisState();

    expect(component.comparisonPlanA).toBe(1);
    expect(component.comparisonPlanB).toBe(2);
  });

  it("loads the higher comparison plan first so the lower plan is cached", () => {
    component.solutionCount = 10;
    component.solutionCountKnown = true;
    component.comparisonPlanA = 2;
    component.comparisonPlanB = 7;
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) =>
      of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 10,
        result: {
          type,
          solutions: [
            {
              label: `solution ${number}`,
              facets: [
                {
                  id: `action-${number}`,
                  label: `action ${number}`,
                  timestep: number ?? 1,
                  selectionState: "neutral",
                },
              ],
            },
          ],
        },
      }),
    );

    component.compareSelectedPlans();

    expect(service.query$.calls.allArgs().map((args) => args[2])).toEqual([
      7, 2,
    ]);
    expect(component.comparison).toBeDefined();
  });

  it("prepares a requested solution prefix without replacing the displayed plan", () => {
    component.representativeSolution = [facet("initial")];
    component.currentSolutionNumber = 0;
    service.query$.calls.reset();

    component.preparePlansThrough(30);

    expect(service.query$).toHaveBeenCalledOnceWith("run-1", "solution", 30);
    expect(component.solutionCache[30].label).toBe("solution 1");
    expect(component.knownPlanLowerBound).toBe(30);
    expect(component.currentSolutionNumber).toBe(0);
    expect(component.representativeSolution[0].id).toBe("initial");
    expect(component.lastSelectionMessage).toContain("Plans 1–30");
    expect(component.planPreparationLoading).toBeFalse();
  });

  it("clears preparation loading when the plan space changed remotely", () => {
    service.query$.and.returnValue(
      of({
        runId: "run-1",
        selectionRevision: 1,
        solutionCount: null,
        result: { type: "solution", solutions: [] },
      }),
    );
    service.listFacets$.and.returnValue(
      throwError(() => new Error("refresh failed")),
    );

    component.preparePlansThrough(20);

    expect(component.planPreparationLoading).toBeFalse();
    expect(component.isBusy).toBeFalse();
    expect(component.lastSelectionMessage).toContain("another window");
  });

  it("learns the total and returns to the final page after browsing past the end", () => {
    component.solutionCount = 0;
    component.solutionCountKnown = false;
    component.planPageStart = 56;
    component.currentSolutionNumber = 0;
    component.representativeSolution = [facet("initial")];
    service.query$.calls.reset();
    service.query$.and.callFake((_runId, type, number) => {
      const available = (number ?? 0) <= 60;
      return of({
        runId: "run-1",
        selectionRevision: 0,
        solutionCount: 60,
        result: {
          type,
          solutions: available
            ? [
                {
                  label: `solution ${number}`,
                  facets: [
                    {
                      id: `action-${number}`,
                      label: `action ${number}`,
                      timestep: number ?? 1,
                      selectionState: "neutral",
                    },
                  ],
                },
              ]
            : [],
        },
      });
    });

    component.nextPlanPage();

    expect(component.solutionCountKnown).toBeTrue();
    expect(component.solutionCount).toBe(60);
    expect(component.planPageStart).toBe(56);
    expect(component.loadedPlanNumbers).toEqual([56, 57, 58, 59, 60]);
    expect(component.currentSolutionNumber).toBe(0);
    expect(component.representativeSolution[0].id).toBe("initial");
    expect(component.lastSelectionMessage).toContain("60 plans");
  });

  it("ignores required-action results from an invalidated analysis", () => {
    const response = new Subject<PlanPilotQueryResponse>();
    service.query$.and.returnValue(response);

    component.loadRequiredActions();
    (
      component as unknown as { invalidateAnalysisState: () => void }
    ).invalidateAnalysisState();
    response.next({
      runId: "run-1",
      selectionRevision: 0,
      solutionCount: null,
      result: {
        type: "impliedFacets",
        facets: [
          {
            id: "stale-required",
            label: "stale required",
            timestep: 1,
            selectionState: "neutral",
            facetType: "implied",
            selectable: false,
          },
        ],
      },
    });
    response.complete();

    expect(component.requiredActions).toEqual([]);
    expect(component.requiredActionsLoaded).toBeFalse();
  });

  it("records confirmed changes and sends exact inverse and forward undo batches", () => {
    let revision = 0;
    service.applyFacets$.and.callFake((_runId, request) => {
      const facets = request.selections.map((selection) => ({
        id: selection.facetId,
        label: selection.facetId,
        timestep: 1,
        selectionState: selection.selectionState,
        facetType: (selection.selectionState === "neutral"
          ? "optional"
          : "selected") as PlanPilotFacet["facetType"],
      }));
      return of(mutationResponse(facets, facets, 1, ++revision));
    });
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();

    expect(component.undoStack.length).toBe(1);
    expect(component.redoStack.length).toBe(0);
    expect(component.undoStack[0].changes).toEqual([
      jasmine.objectContaining({
        facetId: "include-me",
        from: "neutral",
        to: "positive",
      }),
    ]);

    service.applyFacets$.calls.reset();
    component.undoConstraintChange();

    expect(service.applyFacets$).toHaveBeenCalledWith("run-1", {
      expectedSelectionRevision: 1,
      selections: [
        {
          facetId: "include-me",
          selectionState: "neutral",
          previousSelectionState: "positive",
        },
      ],
    });
    expect(component.undoStack.length).toBe(0);
    expect(component.redoStack.length).toBe(1);

    service.applyFacets$.calls.reset();
    component.redoConstraintChange();

    expect(service.applyFacets$).toHaveBeenCalledWith("run-1", {
      expectedSelectionRevision: 2,
      selections: [
        {
          facetId: "include-me",
          selectionState: "positive",
          previousSelectionState: "neutral",
        },
      ],
    });
    expect(component.undoStack.length).toBe(1);
    expect(component.redoStack.length).toBe(0);
  });

  it("does not move history when undo fails and clears redo after a new branch", () => {
    component.undoStack = [
      {
        label: "Require include-me",
        changes: [
          {
            facetId: "include-me",
            label: "include-me",
            timestep: 1,
            from: "neutral",
            to: "positive",
          },
        ],
      },
    ];
    service.applyFacets$.and.returnValue(
      throwError(() => new Error("offline")),
    );

    component.undoConstraintChange();

    expect(component.undoStack.length).toBe(1);
    expect(component.redoStack.length).toBe(0);

    component.selectionPending = false;
    component.backendError = undefined;
    component.redoStack = [{ label: "old redo", changes: [] }];
    service.applyFacets$.and.returnValue(
      of(
        mutationResponse([
          {
            id: "exclude-me",
            label: "exclude-me",
            timestep: 1,
            selectionState: "negative",
            facetType: "selected" as const,
          },
        ]),
      ),
    );
    component.applyFacetSelection("exclude-me", "negative");
    component.computeStagedSelections();

    expect(component.redoStack).toEqual([]);
    expect(component.undoStack[component.undoStack.length - 1].label).toContain(
      "Forbid",
    );
  });

  it("reloads authoritative facets and clears history after an undo revision conflict", () => {
    component.undoStack = [
      {
        label: "Require include-me",
        changes: [
          {
            facetId: "include-me",
            label: "include-me",
            timestep: 1,
            from: "neutral",
            to: "positive",
          },
        ],
      },
    ];
    component.activePinnedFacets["stale-pinned"] = facet("stale-pinned");
    component.knownFacets["stale-known"] = facet("stale-known");
    service.applyFacets$.and.returnValue(
      throwError(() => ({
        status: 409,
        error: { code: "SELECTION_CONFLICT" },
      })),
    );

    component.undoConstraintChange();

    expect(component.undoStack).toEqual([]);
    expect(component.redoStack).toEqual([]);
    expect(component.activePinnedFacets).toEqual({});
    expect(component.knownFacets).toEqual({});
    expect(component.lastSelectionMessage).toContain("History was cleared");
    expect(service.listFacets$).toHaveBeenCalledWith("run-1");
  });

  it("keeps only the latest fifty confirmed history entries", () => {
    component.undoStack = Array.from({ length: 50 }, (_, index) => ({
      label: `old-${index}`,
      changes: [],
    }));
    service.applyFacets$.and.returnValue(
      of(
        mutationResponse([
          {
            id: "include-me",
            label: "include-me",
            timestep: 1,
            selectionState: "positive",
            facetType: "selected",
          },
        ]),
      ),
    );
    component.applyFacetSelection("include-me", "positive");

    component.computeStagedSelections();

    expect(component.undoStack.length).toBe(50);
    expect(component.undoStack[0].label).toBe("old-1");
    expect(component.undoStack[49].label).toContain("Require");
  });
});

function facet(id: string) {
  return {
    id,
    label: id,
    detail: `${id} detail`,
    timestep: 1,
    action: id,
    group: "Available",
    selection: "neutral" as const,
    remainingSolutions: null,
    remainingFacets: null,
    solutionReduction: null,
    facetReduction: null,
    available: true,
    facetType: "optional" as const,
    nodeType: "candidate" as const,
    tokens: [id],
  };
}

function backendFacet(
  id: string,
  selectionState: "positive" | "negative" | "neutral",
) {
  return {
    id,
    label: id,
    timestep: 1,
    selectionState,
    facetType: "optional" as const,
  };
}

function mutationResponse(
  facets: PlanPilotFacet[],
  solutionFacets: PlanPilotFacet[] = facets,
  solutionCount: number | null = 1,
  selectionRevision = 1,
): PlanPilotSelectionMutationResponse {
  return {
    runId: "run-1",
    selectionRevision,
    solutionCount,
    solution: { label: "solution 1", facets: solutionFacets },
    facets,
  };
}

function impactFacet(
  id: string,
  metric: "solution" | "facets",
  positiveReduction: number,
  negativeReduction: number,
  positiveRemaining: number,
  negativeRemaining: number,
): PlanPilotFacet {
  const empty = { positive: null, negative: null };
  const values = { positive: positiveReduction, negative: negativeReduction };
  const remaining = {
    positive: positiveRemaining,
    negative: negativeRemaining,
  };
  return {
    id,
    label: id,
    timestep: 1,
    selectionState: "neutral",
    reduction: {
      solution: metric === "solution" ? values : empty,
      facets: metric === "facets" ? values : empty,
    },
    remaining: {
      solution: metric === "solution" ? remaining : empty,
      facets: metric === "facets" ? remaining : empty,
    },
  };
}

function project(id: string): Project {
  return {
    _id: id,
    name: "Project",
    public: false,
    description: "",
    user: "test-user",
    domain: "test-domain",
    instanceInfo: null,
    baseTask: { name: "test-task", objects: [] },
    settings: defaultGeneralSetting,
    itemType: "general-project",
  };
}

function sessionResponse(runId: string): PlanPilotSessionResponse {
  return {
    runId,
    status: "READY",
    configuration: {
      horizon: 1,
      encoding: "bounded",
      abstractTimeSteps: false,
    },
    hasPlan: true,
    minimumHorizon: 1,
    selectionRevision: 0,
    solutionCount: 1,
    solution: {
      label: "solution 1",
      facets: [
        {
          id: "move-1",
          label: "move",
          timestep: 1,
          selectionState: "neutral",
        },
      ],
    },
    facets: [],
  };
}

function rootFacet() {
  return {
    ...facet("__session__"),
    label: "Plan start",
    nodeType: "root" as const,
    facetType: undefined,
  };
}
