import { TestBed } from "@angular/core/testing";
import { convertToParamMap, ActivatedRoute } from "@angular/router";
import { provideMockStore } from "@ngrx/store/testing";
import { filter, firstValueFrom, of } from "rxjs";
import {
  PlanPilotFacet,
  PlanPilotSelectionState,
} from "../../domain/planpilot";
import { PlanPilotService } from "../../service/planpilot.service";
import {
  selectDecisions,
  selectFacets,
  selectRunId,
} from "../../state/planpilot.feature";
import { PlanPilotFacetsComponent } from "./planpilot-facets.component";

describe("PlanPilotFacetsComponent filters", () => {
  let component: PlanPilotFacetsComponent;

  const facets = [
    facet("stack-a-b-t1", "stack a b", 1),
    facet("stack-b-c-t2", "stack b c", 2),
    facet("unstack-a-b-t2", "unstack a b", 2),
    facet('holds(clear("a"),0)', "clear a", null),
  ];
  const decisions = [facet("pick-up-a-t3", "pick-up a", 3)];

  beforeEach(() => {
    const service = jasmine.createSpyObj<PlanPilotService>("PlanPilotService", [
      "stopSession$",
    ]);
    service.stopSession$.and.returnValue(of(undefined));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ projectId: "project-1" })),
          },
        },
        provideMockStore({
          selectors: [
            { selector: selectRunId, value: undefined },
            { selector: selectFacets, value: facets },
            { selector: selectDecisions, value: decisions },
          ],
        }),
        { provide: PlanPilotService, useValue: service },
      ],
    });

    component = TestBed.runInInjectionContext(
      () => new PlanPilotFacetsComponent(),
    );
  });

  it("combines action and timestep filters", async () => {
    const result = firstValueFrom(
      component.filteredFacets$.pipe(
        filter((items) => items.length === 1 && items[0].id === "stack-b-c-t2"),
      ),
    );

    component.actionFilterControl.setValue("stack");
    component.timestepFilterControl.setValue("2");

    expect((await result).map((item) => item.id)).toEqual(["stack-b-c-t2"]);
  });

  it("lists action names and available timesteps once", async () => {
    expect(await firstValueFrom(component.actionOptions$)).toEqual([
      "pick-up",
      "stack",
      "unstack",
    ]);
    expect(await firstValueFrom(component.timestepOptions$)).toEqual([
      { value: "1", label: "t = 1" },
      { value: "2", label: "t = 2" },
      { value: "3", label: "t = 3" },
      { value: "any", label: "any time" },
    ]);
  });

  it("shows only abstract facets for the any-time filter", async () => {
    const result = firstValueFrom(
      component.filteredFacets$.pipe(
        filter(
          (items) =>
            items.length === 1 && items[0].id === 'holds(clear("a"),0)',
        ),
      ),
    );

    component.timestepFilterControl.setValue("any");

    expect((await result).map((item) => item.id)).toEqual([
      'holds(clear("a"),0)',
    ]);
  });
});

function facet(
  id: string,
  label: string,
  timestep: number | null,
): PlanPilotFacet {
  return {
    id,
    label,
    timestep,
    selectionState: PlanPilotSelectionState.NEUTRAL,
    selectable: true,
  };
}
