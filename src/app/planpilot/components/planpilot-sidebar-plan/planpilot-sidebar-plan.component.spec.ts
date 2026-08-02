import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PlanPilotSidebarPlanComponent } from "./planpilot-sidebar-plan.component";

describe("PlanPilotSidebarPlanComponent", () => {
  let fixture: ComponentFixture<PlanPilotSidebarPlanComponent>;
  let component: PlanPilotSidebarPlanComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanPilotSidebarPlanComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PlanPilotSidebarPlanComponent);
    component = fixture.componentInstance;
  });

  it("keeps plan-space settings visible and separates graph focus from action filtering", () => {
    component.timelineRows = [
      {
        key: 2,
        label: "t2",
        displayedActions: ["stack a b"],
        alternativeCount: 3,
        requiredCount: 0,
        forbiddenCount: 0,
      },
    ];
    component.timestepActionCounts = { 2: 3 };
    const focused: Array<number | "any"> = [];
    const filtered: Array<number | "any"> = [];
    component.timestepFocus.subscribe((value) => focused.push(value));
    component.timestepActions.subscribe((value) => filtered.push(value));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector("#planpilot-settings"),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector("details#planpilot-settings"),
    ).toBeNull();

    fixture.nativeElement.querySelector(".timeline-focus").click();
    expect(focused).toEqual([2]);
    expect(filtered).toEqual([]);

    fixture.nativeElement.querySelector(".timeline-show-actions").click();
    expect(filtered).toEqual([2]);
  });

  it("keeps exact counting with the plan-space settings", () => {
    component.knownPlanLowerBound = 4;
    let countRequests = 0;
    component.solutionCountLoad.subscribe(() => {
      countRequests += 1;
    });
    fixture.detectChanges();

    const calculation = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-calculation"]',
    ) as HTMLElement;
    expect(calculation.textContent).toContain("4+ found");
    expect(calculation.textContent).toContain("Count all");
    expect(calculation.textContent).toContain(
      "Count plans without loading them",
    );

    const countButton = Array.from(calculation.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Count all"),
    );
    (countButton as HTMLButtonElement).click();
    expect(countRequests).toBe(1);
  });

  it("lets the user change the timeout for longer analyses", () => {
    component.analysisTimeoutSeconds = 45;
    component.maxAnalysisTimeoutSeconds = 240;
    let changed: Event | undefined;
    component.analysisTimeoutChange.subscribe((event) => {
      changed = event;
    });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      ".analysis-timeout input",
    ) as HTMLInputElement;
    expect(input.value).toBe("45");
    expect(input.max).toBe("240");

    input.value = "90";
    input.dispatchEvent(new Event("change"));
    expect((changed?.target as HTMLInputElement).value).toBe("90");
  });

  it("shows flexible facets separately from the concrete displayed plan", () => {
    component.timelineRows = [
      {
        key: 2,
        label: "t2",
        displayedActions: ["stack a b"],
        alternativeCount: 0,
        requiredCount: 0,
        forbiddenCount: 0,
      },
      {
        key: "any",
        label: "Any step",
        displayedActions: [],
        alternativeCount: 3,
        requiredCount: 0,
        forbiddenCount: 0,
      },
    ];
    component.timestepActionCounts = { 2: 1, any: 3 };
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll(".timeline-row");
    expect(rows[0].textContent).toContain("t2");
    expect(rows[0].textContent).toContain("stack a b");
    expect(rows[1].textContent).toContain("Any step");
    expect(rows[1].textContent).toContain(
      "Action facets that apply to any timestep",
    );
  });

  it("shows the exact count without a second preparation action", () => {
    component.solutionCountKnown = true;
    component.solutionCount = 60;
    fixture.detectChanges();

    const calculation = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-calculation"]',
    ) as HTMLElement;
    expect(calculation.textContent).toContain("60 plans in this space");
    expect(calculation.textContent).not.toContain("Prepare");
    expect(calculation.querySelector("button")).toBeNull();
  });

  it("keeps cancellation beside a running exact count", () => {
    component.solutionCountLoading = true;
    component.canCancelOperation = true;
    component.isBusy = true;
    let cancellations = 0;
    component.operationCancel.subscribe(() => {
      cancellations += 1;
    });
    fixture.detectChanges();

    const cancel = fixture.nativeElement.querySelector(
      ".count-actions .operation-cancel",
    ) as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    cancel.click();

    expect(cancellations).toBe(1);
  });
});
