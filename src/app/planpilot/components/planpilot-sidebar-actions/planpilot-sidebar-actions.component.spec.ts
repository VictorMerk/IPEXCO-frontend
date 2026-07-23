import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PlanPilotSidebarActionsComponent } from "./planpilot-sidebar-actions.component";

describe("PlanPilotSidebarActionsComponent", () => {
  let fixture: ComponentFixture<PlanPilotSidebarActionsComponent>;
  let component: PlanPilotSidebarActionsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlanPilotSidebarActionsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(PlanPilotSidebarActionsComponent);
    component = fixture.componentInstance;
  });

  it("emits the exact facet id from a stable, inline action row", () => {
    const facet = {
      id: "facet-7",
      label: "stack a b",
      detail: "t2",
      timestep: 2,
      action: "stack",
      group: "Available",
      selection: "neutral" as const,
      remainingSolutions: null,
      remainingFacets: null,
      solutionReduction: null,
      facetReduction: null,
      available: true,
      tokens: ["stack"],
    };
    component.rows = [
      {
        facet,
        timestepLabel: "t2",
        stateLabel: "Available",
        displayedPlan: false,
        required: false,
        forbidden: false,
        selected: false,
      },
    ];
    component.matchingCount = 46;
    let selectedId = "";
    component.facetSelect.subscribe((value) => {
      selectedId = value;
    });
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector(".facet-result");
    expect(row.getAttribute("data-facet-id")).toBe("facet-7");
    const count = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-action-result-count"]',
    );
    expect(count.textContent.trim()).toBe("1 of 46 shown");
    expect(count.dataset.renderedCount).toBe("1");
    expect(count.dataset.matchingCount).toBe("46");
    row.click();
    expect(selectedId).toBe("facet-7");
  });

  it("keeps the selected action controls visible without adding another scroll area", () => {
    component.selectedAction = {
      facet: {
        id: "facet-42",
        label: "unstack a b",
        detail: "t4 · Required by you",
        timestep: 4,
        action: "unstack",
        group: "Available",
        selection: "positive",
        remainingSolutions: null,
        remainingFacets: null,
        solutionReduction: null,
        facetReduction: null,
        available: true,
        tokens: ["unstack", "a", "b"],
      },
      timestepLabel: "t4",
      stateLabel: "Required by you",
      displayedPlan: false,
      required: true,
      forbidden: false,
      selected: true,
      canRequire: false,
      canForbid: true,
      canClear: true,
      canPreviewImpact: true,
      clearHint: "Remove this user constraint",
    };
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-selected-action-panel"]',
    ) as HTMLElement;
    expect(panel)
      .withContext("stable selector for browser smoke")
      .not.toBeNull();

    const style = getComputedStyle(panel);
    expect(style.position).toBe("sticky");
    expect(["auto", "scroll"]).not.toContain(style.overflowY);
    expect(panel.querySelector("p")).toBeNull();
    expect(panel.querySelector(".clear-action")?.textContent).toContain(
      "Remove constraint",
    );
  });

  it("keeps fixed-action controls read-only but allows an impact preview", () => {
    let previewCount = 0;
    component.impactCalculate.subscribe(() => {
      previewCount += 1;
    });
    component.selectedAction = {
      facet: {
        id: "fixed",
        label: "hold a",
        detail: "t1 · In every remaining plan (read-only)",
        timestep: 1,
        action: "hold",
        group: "In every plan",
        selection: "neutral",
        remainingSolutions: null,
        remainingFacets: null,
        solutionReduction: null,
        facetReduction: null,
        available: true,
        selectable: false,
        facetType: "implied",
        tokens: ["hold", "a"],
      },
      timestepLabel: "t1",
      stateLabel: "Occurs in every plan",
      displayedPlan: false,
      required: false,
      forbidden: false,
      selected: true,
      canRequire: false,
      canForbid: false,
      canClear: false,
      canPreviewImpact: true,
      clearHint: "Fixed",
    };
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "This action is fixed in the current plan space.",
    );
    expect(fixture.nativeElement.querySelector(".selected-facet p")).toBeNull();
    const preview = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-facet-impact"] button',
    ) as HTMLButtonElement;
    expect(preview.disabled).toBeFalse();
    preview.click();
    expect(previewCount).toBe(1);
  });

  it("shows typed Require and Forbid plan counts as a hypothetical preview", () => {
    component.impactCalculated = true;
    component.selectedAction = {
      facet: {
        id: "impact",
        label: "stack a b",
        detail: "",
        timestep: 2,
        action: "stack",
        group: "Available",
        selection: "neutral",
        remainingSolutions: null,
        remainingFacets: null,
        solutionReduction: null,
        facetReduction: null,
        available: true,
        tokens: ["stack", "a", "b"],
      },
      timestepLabel: "t2",
      stateLabel: "Available",
      displayedPlan: false,
      required: false,
      forbidden: false,
      selected: true,
      canRequire: true,
      canForbid: true,
      canClear: false,
      canPreviewImpact: true,
      clearHint: "",
      requireImpact: {
        available: true,
        totalPlans: 60,
        plansRemaining: 15,
        plansRemoved: 45,
        reductionPercent: 75,
      },
      forbidImpact: {
        available: true,
        totalPlans: 60,
        plansRemaining: 45,
        plansRemoved: 15,
        reductionPercent: 25,
      },
    };
    fixture.detectChanges();

    const impact = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-facet-impact"]',
    );
    expect(impact.textContent).toContain(
      "Require keeps plans with this action; Forbid keeps plans without it",
    );
    expect(impact.textContent).toContain("If required");
    expect(impact.textContent).toContain("15 of 60 plans left");
    expect(impact.textContent).toContain("45 removed · 75%");
    expect(impact.textContent).toContain("If forbidden");
    expect(impact.textContent).toContain("15 removed · 25%");
  });

  it("shows availability when exact impact counting takes too long", () => {
    component.impactCalculated = true;
    component.impactNotice =
      "Exact counts took too long. Availability is shown instead.";
    component.selectedAction = {
      facet: {
        id: "impact",
        label: "stack a b",
        detail: "",
        timestep: 2,
        action: "stack",
        group: "Available",
        selection: "neutral",
        remainingSolutions: null,
        remainingFacets: null,
        solutionReduction: null,
        facetReduction: null,
        available: true,
        tokens: ["stack", "a", "b"],
      },
      timestepLabel: "t2",
      stateLabel: "Available",
      displayedPlan: false,
      required: false,
      forbidden: false,
      selected: true,
      canRequire: true,
      canForbid: true,
      canClear: false,
      canPreviewImpact: true,
      clearHint: "",
      requireImpact: {
        available: true,
        totalPlans: null,
        plansRemaining: null,
        plansRemoved: null,
        reductionPercent: null,
      },
      forbidImpact: {
        available: false,
        totalPlans: null,
        plansRemaining: null,
        plansRemoved: null,
        reductionPercent: null,
      },
    };
    fixture.detectChanges();

    const impact = fixture.nativeElement.querySelector(
      '[data-testid="planpilot-facet-impact"]',
    );
    expect(impact.textContent).toContain("Plan available");
    expect(impact.textContent).toContain("No valid plan");
    expect(impact.textContent).not.toContain("— removed");
    expect(impact.textContent).toContain("Exact counts took too long");
  });
});
