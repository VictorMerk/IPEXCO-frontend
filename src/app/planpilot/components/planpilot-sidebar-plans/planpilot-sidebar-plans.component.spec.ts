import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PlanPilotSidebarPlansComponent } from "./planpilot-sidebar-plans.component";

describe("PlanPilotSidebarPlansComponent", () => {
  let fixture: ComponentFixture<PlanPilotSidebarPlansComponent>;
  let component: PlanPilotSidebarPlansComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanPilotSidebarPlansComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PlanPilotSidebarPlansComponent);
    component = fixture.componentInstance;
  });

  it("presents In every plan as a solver analysis, not a constraint", () => {
    let loadCount = 0;
    component.commonActionsLoad.subscribe(() => {
      loadCount += 1;
    });
    fixture.detectChanges();

    const common = fixture.nativeElement.querySelector(
      "#planpilot-shared-actions",
    );
    expect(common.tagName).toBe("SECTION");
    expect(common.querySelector("summary")).toBeNull();
    expect(common.textContent).toContain(
      "Actions found in every remaining plan",
    );
    expect(common.textContent).toContain(
      "This does not change your constraints",
    );
    common.querySelector(".compact-text-action").click();
    expect(loadCount).toBe(1);
  });

  it("keeps calculated solver-implied actions collapsed and non-interactive", () => {
    component.commonActionsLoaded = true;
    component.commonActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    fixture.detectChanges();

    const result = fixture.nativeElement.querySelector(
      ".common-actions-result",
    ) as HTMLDetailsElement;
    expect(result.open).toBeFalse();
    expect(result.textContent).toContain("1 solver-implied actions");
    expect(result.querySelector(".analysis-row")?.tagName).toBe("DIV");
    expect(result.querySelector("button")).toBeNull();
    expect(result.querySelector("mat-icon")?.textContent).toContain("done_all");
  });

  it("shows one always-open browser without a browse cap or Displayed badge", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.solutionCountKnown = true;
    component.solutionCount = 60;
    component.currentSolutionNumber = 0;
    fixture.detectChanges();

    const browser = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-explorer"]',
    );
    expect(browser.tagName).toBe("SECTION");
    expect(browser.textContent).toContain("Initial plan");
    expect(browser.textContent).toContain("60 plans");
    expect(browser.textContent).not.toContain("Displayed");
    expect(
      (browser.querySelector(".solution-action-list") as HTMLDetailsElement)
        .open,
    ).toBeFalse();
    expect(browser.textContent).not.toContain("Browsing is limited");
    expect(browser.querySelector("#planpilot-plan-number").max).toBe("60");
  });

  it("keeps direct plan opening available before an exact count", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.currentSolutionNumber = 1;
    component.knownPlanLowerBound = 1;
    let requested = 0;
    component.solutionJump.subscribe((number) => {
      requested = number;
    });
    fixture.detectChanges();

    const browser = fixture.nativeElement.querySelector(".plan-explorer");
    expect(browser.textContent).not.toContain("Count total");
    const input = browser.querySelector(
      "#planpilot-plan-number",
    ) as HTMLInputElement;
    expect(input.disabled).toBeFalse();
    expect(input.max).toBe("");
    input.value = "23";
    input
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(requested).toBe(23);
  });

  it("loads plans in visible batches and keeps cancellation next to the job", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.loadedPlanCount = 20;
    component.nextPlanBatchStart = 21;
    component.nextPlanBatchEnd = 40;
    let batches = 0;
    component.planBatchLoad.subscribe(() => {
      batches += 1;
    });
    fixture.detectChanges();

    const loader = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-batch-loader"]',
    ) as HTMLElement;
    expect(loader.textContent).toContain("20 loaded");
    const load = Array.from(loader.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Load next 20"),
    ) as HTMLButtonElement;
    load.click();
    expect(batches).toBe(1);

    component.planBatchLoading = true;
    component.canCancelOperation = true;
    component.isBusy = true;
    let cancellations = 0;
    component.operationCancel.subscribe(() => {
      cancellations += 1;
    });
    fixture.detectChanges();

    expect(loader.textContent).toContain("Loading 21–40");
    const cancel = fixture.nativeElement.querySelector(
      ".plan-batch-loader .operation-cancel",
    ) as HTMLButtonElement;
    expect(cancel.disabled).toBeFalse();
    cancel.click();
    expect(cancellations).toBe(1);
  });

  it("warns before a large direct jump", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.knownPlanLowerBound = 20;
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      "#planpilot-plan-number",
    ) as HTMLInputElement;
    input.value = "80";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(".plan-jump-warning").textContent,
    ).toContain("is not loaded");
  });

  it("does not render plan-count errors in the plan browser", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.currentSolutionNumber = 1;
    fixture.detectChanges();

    const browser = fixture.nativeElement.querySelector(".plan-explorer");
    expect(browser.textContent).not.toContain("Counting timed out.");
    expect(
      fixture.nativeElement.querySelector(".no-solution-message"),
    ).toBeNull();
  });

  it("keeps the plan list and comparison controls visible", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.planSummaries = [
      { number: 1, title: "Plan 1", text: "1 action" },
    ];
    component.currentSolutionNumber = 1;
    component.knownPlanLowerBound = 1;
    fixture.detectChanges();

    const browser = fixture.nativeElement.querySelector(".plan-explorer");
    expect(browser.querySelector(".plan-summary-list")).not.toBeNull();
    expect(browser.querySelector(".plan-comparison")).not.toBeNull();
    expect(browser.querySelector(".plan-summary-row").ariaCurrent).toBe("true");
    expect(browser.querySelector(".plan-comparison").closest("details")).toBe(
      null,
    );
  });

  it("switches directly between compared plans", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.comparisonPlanA = 3;
    component.comparisonPlanB = 8;
    component.comparison = {
      same: [],
      moved: [],
      onlyA: [],
      onlyB: [],
    };
    const shown: number[] = [];
    component.comparisonPlanShow.subscribe((number) => shown.push(number));
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      ".comparison-switch button",
    );
    buttons[0].click();
    buttons[1].click();

    expect(shown).toEqual([3, 8]);
  });

  it("marks selectable plan rows as clickable", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.planSummaries = [
      { number: 1, title: "Plan 1", text: "1 action" },
    ];
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(
      ".plan-summary-row",
    ) as HTMLButtonElement;
    expect(row.disabled).toBeFalse();
    expect(getComputedStyle(row).cursor).toBe("pointer");

    component.isBusy = true;
    fixture.detectChanges();
    const disabledRow = fixture.nativeElement.querySelector(
      ".plan-summary-row",
    ) as HTMLButtonElement;
    expect(disabledRow.disabled).toBeTrue();
    expect(getComputedStyle(disabledRow).cursor).not.toBe("pointer");
  });

  it("emits a direct plan jump from the number form", () => {
    component.displayedPlanActions = [
      { id: "move-1", label: "move a", timestepLabel: "t1" },
    ];
    component.currentSolutionNumber = 1;
    component.solutionCountKnown = true;
    component.solutionCount = 60;
    let requested = 0;
    component.solutionJump.subscribe((number) => {
      requested = number;
    });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      "#planpilot-plan-number",
    ) as HTMLInputElement;
    input.value = "23";
    const form = input.closest("form") as HTMLFormElement;
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    expect(requested).toBe(23);
  });
});
