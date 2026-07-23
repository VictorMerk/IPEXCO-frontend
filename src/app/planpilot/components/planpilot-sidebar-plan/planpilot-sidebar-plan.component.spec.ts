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

  it("keeps plan preparation and exact counting with the plan-space settings", () => {
    component.knownPlanLowerBound = 4;
    let prepared = 0;
    let countRequests = 0;
    component.plansPrepare.subscribe((value) => {
      prepared = value;
    });
    component.solutionCountLoad.subscribe(() => {
      countRequests += 1;
    });
    fixture.detectChanges();

    const calculation = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-calculation"]',
    ) as HTMLElement;
    expect(calculation.textContent).toContain("4+ found");
    expect(calculation.textContent).toContain("Count all");

    const input = calculation.querySelector(
      "#planpilot-prepare-count",
    ) as HTMLInputElement;
    input.value = "35";
    input
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(prepared).toBe(35);

    const countButton = Array.from(calculation.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Count all"),
    );
    (countButton as HTMLButtonElement).click();
    expect(countRequests).toBe(1);
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

  it("offers to prepare every plan after the exact count is known", () => {
    component.solutionCountKnown = true;
    component.solutionCount = 60;
    let prepared = 0;
    component.plansPrepare.subscribe((value) => {
      prepared = value;
    });
    fixture.detectChanges();

    const calculation = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-plan-calculation"]',
    ) as HTMLElement;
    expect(calculation.textContent).toContain("60 plans in this space");
    const prepareAll = Array.from(calculation.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Prepare all"),
    );
    (prepareAll as HTMLButtonElement).click();

    expect(prepared).toBe(60);
  });

  it("keeps the suggested preparation count within a small exact plan space", () => {
    component.solutionCountKnown = true;
    component.solutionCount = 12;
    let prepared = 0;
    component.plansPrepare.subscribe((value) => {
      prepared = value;
    });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      "#planpilot-prepare-count",
    ) as HTMLInputElement;
    expect(input.value).toBe("12");
    expect(input.max).toBe("12");
    expect(input.validity.valid).toBeTrue();

    input
      .closest("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(prepared).toBe(12);
  });
});
