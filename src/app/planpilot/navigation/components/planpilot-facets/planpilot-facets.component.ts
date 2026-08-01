import { AsyncPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toObservable, toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { combineLatest } from "rxjs";
import { map, startWith, take } from "rxjs/operators";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { Store } from "@ngrx/store";
import {
  isSelectableFacet,
  PlanPilotEncoding,
  PlanPilotFacet,
  PlanPilotSelectionState,
  SelectPlanPilotFacetRequest,
} from "../../domain/planpilot";
import {
  clearPlanPilotImpliedFacets,
  queryPlanPilotImpliedFacets,
  queryPlanPilotSolutionCount,
  queryPlanPilotSolutionReduction,
  queryPlanPilotSolutions,
  startPlanPilotSession,
  submitPlanPilotSelections,
} from "../../state/planpilot.actions";
import {
  selectConfiguration,
  selectCountLoading,
  selectDecisions,
  selectError,
  selectFacets,
  selectImpliedFacets,
  selectImpliedFacetsLoading,
  selectImpliedFacetsShown,
  selectLoading,
  selectMinimumHorizon,
  selectReductionLoading,
  selectRequestedHorizon,
  selectRunId,
  selectSolutionCount,
  selectSolutionLimit,
  selectSolutions,
  selectSolutionsLoading,
} from "../../state/planpilot.feature";
import { SOLUTION_PAGE_SIZE } from "../../state/effects/planpilot.effect";
import { PlanPilotService } from "../../service/planpilot.service";
import { planPilotError } from "../../../service/planpilot-error";

interface DecisionRow {
  facet: PlanPilotFacet;
  displayState: PlanPilotSelectionState;
  pending: boolean;
  pendingLabel: string;
}

type FacetKind = "occurs" | "holds";

interface OpenFacetGroup {
  kind: FacetKind;
  title: string;
  emptyText: string;
  facets: PlanPilotFacet[];
}

@Component({
  selector: "app-planpilot-facets",
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: "./planpilot-facets.component.html",
  styleUrl: "./planpilot-facets.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanPilotFacetsComponent {
  private store = inject(Store);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private service = inject(PlanPilotService);
  private destroyRef = inject(DestroyRef);

  private projectId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("projectId"))),
  );

  // Action-name filter ("" = show all).
  filterControl = this.fb.nonNullable.control("");
  private filterLabel$ = this.filterControl.valueChanges.pipe(startWith(""));

  // Timestep filter ("" = all; "any" = abstract/no timestep; otherwise the
  // timestep as a string). Applied together with the action filter.
  timestepControl = this.fb.nonNullable.control("");
  private filterTimestep$ = this.timestepControl.valueChanges.pipe(startWith(""));

  // Selections stay local until they are submitted together.
  pending = signal<Map<string, SelectPlanPilotFacetRequest>>(new Map());
  pendingCount = computed(() => this.pending().size);
  private pending$ = toObservable(this.pending);

  runId$ = this.store.select(selectRunId);
  private runId = toSignal(this.runId$);
  facets$ = this.store.select(selectFacets);
  decisions$ = this.store.select(selectDecisions);
  // Filter dropdown options: distinct action names without parameters
  // (pick-up, stack, …). State (holds) facets are excluded from the filter.
  filterOptions$ = combineLatest([this.facets$, this.decisions$]).pipe(
    map(([facets, decisions]) =>
      this.actionNames(
        [...facets, ...decisions].filter(
          (facet) => this.facetKind(facet) === "occurs",
        ),
      ),
    ),
  );
  // Timestep dropdown options: the distinct timesteps present (open + decided),
  // ascending, with an "any time" entry last for abstract facets.
  timestepOptions$ = combineLatest([this.facets$, this.decisions$]).pipe(
    map(([facets, decisions]) => this.timestepOptions([...facets, ...decisions])),
  );
  filteredFacets$ = combineLatest([
    this.facets$,
    this.pending$,
    this.filterLabel$,
    this.filterTimestep$,
  ]).pipe(
    map(([facets, pending, label, timestep]) =>
      this.filterByTimestep(
        this.filterByLabel(
          facets.filter(
            (facet) =>
              isSelectableFacet(facet) &&
              !this.isStagedChoice(pending, facet.id),
          ),
          label,
        ),
        timestep,
      ),
    ),
  );
  openFacetGroups$ = this.filteredFacets$.pipe(
    map((facets) => this.groupOpenFacets(facets)),
  );
  madeDecisions$ = combineLatest([
    this.decisions$,
    this.facets$,
    this.pending$,
    this.filterLabel$,
    this.filterTimestep$,
  ]).pipe(
    map(([decisions, facets, pending, label, timestep]) =>
      this.buildDecisionRows(decisions, facets, pending, label, timestep),
    ),
  );
  solutionCount$ = this.store.select(selectSolutionCount);
  countLoading$ = this.store.select(selectCountLoading);
  reductionLoading$ = this.store.select(selectReductionLoading);
  configuration$ = this.store.select(selectConfiguration);
  requestedHorizon$ = this.store.select(selectRequestedHorizon);
  minimumHorizon$ = this.store.select(selectMinimumHorizon);
  solutions$ = this.store.select(selectSolutions);
  solutionsLoading$ = this.store.select(selectSolutionsLoading);
  private solutionLimit$ = this.store.select(selectSolutionLimit);

  hasMoreSolutions$ = combineLatest([
    this.solutions$,
    this.solutionCount$,
    this.solutionLimit$,
  ]).pipe(
    map(
      ([solutions, count, limit]) =>
        solutions.length > 0 &&
        solutions.length >= limit &&
        (count === undefined || solutions.length < count),
    ),
  );
  // Do not list the user's own decisions as implied facets.
  impliedFacets$ = combineLatest([
    this.store.select(selectImpliedFacets),
    this.decisions$,
  ]).pipe(
    map(([implied, decisions]) => {
      const decisionIds = new Set(decisions.map((decision) => decision.id));
      return this.sortFacets(
        implied.filter((facet) => !decisionIds.has(facet.id)),
      );
    }),
  );
  impliedFacetsShown$ = this.store.select(selectImpliedFacetsShown);
  impliedFacetsLoading$ = this.store.select(selectImpliedFacetsLoading);
  loading$ = this.store.select(selectLoading);
  error$ = this.store
    .select(selectError)
    .pipe(map((err) => this.toMessage(err)));

  readonly SelectionState = PlanPilotSelectionState;
  readonly encodings = Object.values(PlanPilotEncoding);

  startForm = this.fb.nonNullable.group({
    horizon: [6, [Validators.required, Validators.min(1)]],
    encoding: [PlanPilotEncoding.BOUNDED, Validators.required],
    abstractTimeSteps: [false],
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      const runId = this.runId();
      if (runId) {
        this.service.stopSession$(runId).subscribe();
      }
    });
  }

  startSession(): void {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }
    const { horizon, encoding, abstractTimeSteps } =
      this.startForm.getRawValue();
    this.store.dispatch(
      startPlanPilotSession({
        request: {
          projectId,
          horizon,
          encoding,
          abstractTimeSteps,
          stateFacets: true,
        },
      }),
    );
  }

  onSelectionChange(
    facet: PlanPilotFacet,
    next: PlanPilotSelectionState,
  ): void {
    const staged = new Map(this.pending());
    if (next === facet.selectionState) {
      staged.delete(facet.id);
    } else {
      staged.set(facet.id, {
        facetId: facet.id,
        selectionState: next,
        previousSelectionState: facet.selectionState,
      });
    }
    this.pending.set(staged);
  }

  selectionFor(facet: PlanPilotFacet): PlanPilotSelectionState {
    return this.pending().get(facet.id)?.selectionState ?? facet.selectionState;
  }

  isPending(facet: PlanPilotFacet): boolean {
    return this.pending().has(facet.id);
  }

  deselect(decision: PlanPilotFacet): void {
    this.onSelectionChange(decision, PlanPilotSelectionState.NEUTRAL);
  }

  toggleDecision(row: DecisionRow): void {
    if (row.pending) {
      this.onSelectionChange(row.facet, row.facet.selectionState);
    } else {
      this.deselect(row.facet);
    }
  }

  private isStagedChoice(
    pending: Map<string, SelectPlanPilotFacetRequest>,
    facetId: string,
  ): boolean {
    const staged = pending.get(facetId);
    return (
      staged !== undefined &&
      staged.selectionState !== PlanPilotSelectionState.NEUTRAL
    );
  }

  private buildDecisionRows(
    decisions: PlanPilotFacet[],
    facets: PlanPilotFacet[],
    pending: Map<string, SelectPlanPilotFacetRequest>,
    label: string,
    timestep: string,
  ): DecisionRow[] {
    const rows: DecisionRow[] = [];
    const decisionIds = new Set(decisions.map((d) => d.id));

    for (const decision of decisions) {
      const staged = pending.get(decision.id);
      const pendingUndo =
        staged?.selectionState === PlanPilotSelectionState.NEUTRAL;
      rows.push({
        facet: decision,
        displayState: decision.selectionState,
        pending: pendingUndo,
        pendingLabel: pendingUndo ? "pending undo" : "",
      });
    }

    for (const [id, request] of pending) {
      if (decisionIds.has(id)) {
        continue;
      }
      if (request.selectionState === PlanPilotSelectionState.NEUTRAL) {
        continue;
      }
      const facet = facets.find((f) => f.id === id);
      if (!facet) {
        continue;
      }
      rows.push({
        facet,
        displayState: request.selectionState,
        pending: true,
        pendingLabel: "pending",
      });
    }

    const filtered = this.filterByTimestep(
      this.filterByLabel(rows.map((row) => row.facet), label),
      timestep,
    );
    const filteredIds = new Set(filtered.map((facet) => facet.id));
    return rows
      .filter((row) => filteredIds.has(row.facet.id))
      .sort((a, b) => this.byTimestep(a.facet.timestep, b.facet.timestep));
  }

  submit(): void {
    const requests = [...this.pending().values()];
    if (requests.length === 0) {
      return;
    }
    this.store.dispatch(submitPlanPilotSelections({ requests }));
    this.pending.set(new Map());
  }

  discard(): void {
    this.pending.set(new Map());
  }

  showImpliedFacets(): void {
    this.store.dispatch(queryPlanPilotImpliedFacets());
  }

  hideImpliedFacets(): void {
    this.store.dispatch(clearPlanPilotImpliedFacets());
  }

  private facetKind(facet: PlanPilotFacet): FacetKind {
    return facet.id.startsWith("holds(") ? "holds" : "occurs";
  }

  private groupOpenFacets(facets: PlanPilotFacet[]): OpenFacetGroup[] {
    const actions = this.sortFacets(
      facets.filter((facet) => this.facetKind(facet) === "occurs"),
    );
    const state = this.sortFacets(
      facets.filter((facet) => this.facetKind(facet) === "holds"),
    );
    return [
      {
        kind: "occurs",
        title: "Actions",
        emptyText: "No open action decisions.",
        facets: actions,
      },
      {
        kind: "holds",
        title: "State",
        emptyText: "No open state decisions.",
        facets: state,
      },
    ];
  }

  facetGroupsTotal(groups: OpenFacetGroup[]): number {
    return groups.reduce((sum, group) => sum + group.facets.length, 0);
  }

  timestepLabel(facet: PlanPilotFacet): string {
    return facet.timestep === null ? "any time" : `t = ${facet.timestep}`;
  }

  whatIfCounts(
    facet: PlanPilotFacet,
  ): { enforce: number; forbid: number } | null {
    const solution = facet.remaining?.solution;
    if (solution?.positive == null || solution?.negative == null) {
      return null;
    }
    return { enforce: solution.positive, forbid: solution.negative };
  }

  private sortFacets(facets: PlanPilotFacet[]): PlanPilotFacet[] {
    return [...facets].sort((a, b) => this.byTimestep(a.timestep, b.timestep));
  }

  private byTimestep(a: number | null, b: number | null): number {
    if (a === null && b === null) {
      return 0;
    }
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }
    return a - b;
  }

  // Keep only facets of the selected action ("" = no filter). The filter value
  // is a parameter-less action name, so it matches every action of that kind.
  private filterByLabel(
    facets: PlanPilotFacet[],
    action: string,
  ): PlanPilotFacet[] {
    if (!action) {
      return facets;
    }
    return facets.filter((facet) => this.actionName(facet) === action);
  }

  // Keep only facets at the selected timestep ("" = all; "any" = no timestep).
  private filterByTimestep(
    facets: PlanPilotFacet[],
    timestep: string,
  ): PlanPilotFacet[] {
    if (!timestep) {
      return facets;
    }
    if (timestep === "any") {
      return facets.filter((facet) => facet.timestep === null);
    }
    return facets.filter((facet) => facet.timestep === Number(timestep));
  }

  // The parameter-less action name of a facet, i.e. the first token of its
  // label (action names contain no spaces; parameters follow).
  private actionName(facet: PlanPilotFacet): string {
    return facet.label.split(" ")[0];
  }

  // Sorted, de-duplicated action names (pick-up, stack, …) for the filter.
  private actionNames(facets: PlanPilotFacet[]): string[] {
    return [...new Set(facets.map((facet) => this.actionName(facet)))].sort(
      (a, b) => a.localeCompare(b),
    );
  }

  // Distinct timesteps present, ascending, with "any time" (null) listed last.
  private timestepOptions(
    facets: PlanPilotFacet[],
  ): { value: string; label: string }[] {
    const numbers = [
      ...new Set(
        facets
          .map((facet) => facet.timestep)
          .filter((timestep): timestep is number => timestep !== null),
      ),
    ].sort((a, b) => a - b);
    const options = numbers.map((timestep) => ({
      value: String(timestep),
      label: `t = ${timestep}`,
    }));
    if (facets.some((facet) => facet.timestep === null)) {
      options.push({ value: "any", label: "any time" });
    }
    return options;
  }

  // Whether any facet filter is active (used for the "no match" messages).
  hasActiveFilter(): boolean {
    return !!this.filterControl.value || !!this.timestepControl.value;
  }

  showMorePlans(): void {
    this.store
      .select(selectSolutionLimit)
      .pipe(take(1))
      .subscribe((limit) =>
        this.store.dispatch(
          queryPlanPilotSolutions({ limit: limit + SOLUTION_PAGE_SIZE }),
        ),
      );
  }

  countPlans(): void {
    this.store.dispatch(queryPlanPilotSolutionCount());
  }

  calculateWhatIfCounts(): void {
    this.store.dispatch(queryPlanPilotSolutionReduction());
  }

  // occurs_sometime entries are landmarks, not ordered plan steps.
  planSteps(facets: PlanPilotFacet[]): PlanPilotFacet[] {
    return facets
      .filter((f) => f.timestep !== null)
      .sort((a, b) => (a.timestep ?? 0) - (b.timestep ?? 0));
  }

  private toMessage(err: unknown): string | undefined {
    if (err === undefined || err === null) {
      return undefined;
    }
    return planPilotError(err).message;
  }
}
