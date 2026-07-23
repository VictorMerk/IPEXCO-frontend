import { AsyncPipe, DOCUMENT } from "@angular/common";
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  catchError,
  concatMap,
  from,
  map,
  Observable,
  of,
  take,
  toArray,
} from "rxjs";
import { BreadcrumbModule } from "src/app/shared/components/breadcrumb/breadcrumb.module";
import { PageModule } from "src/app/shared/components/page/page.module";
import { Project } from "src/app/shared/domain/project";
import {
  PlanPilotGraphComponent,
  PlanPilotGraphConnection,
  PlanPilotGraphTap,
  PlanPilotGraphVisualState,
} from "../../components/planpilot-graph/planpilot-graph.component";
import {
  PlanPilotSelectedActionView,
  PlanPilotSidebarActionsComponent,
} from "../../components/planpilot-sidebar-actions/planpilot-sidebar-actions.component";
import { PlanPilotSidebarPlanComponent } from "../../components/planpilot-sidebar-plan/planpilot-sidebar-plan.component";
import { PlanPilotSidebarPlansComponent } from "../../components/planpilot-sidebar-plans/planpilot-sidebar-plans.component";
import {
  PlanPilotFacet,
  PlanPilotFacetListResponse,
  PlanPilotSelectionMutationResponse,
  PlanPilotSessionResponse,
  PlanPilotService,
} from "../../service/planpilot.service";
import { buildPlanPilotViewGraphConnections } from "./planpilot-graph-connections";
import {
  buildPlanPilotGraphDiagnostic,
  javascriptAssetNames,
  PlanPilotGraphDiagnostic,
} from "./planpilot-graph-diagnostic";
import {
  buildTimelineRows,
  comparePlanSolutions,
  PlanPilotComparison,
  PlanPilotFacetImpact,
  PlanPilotPlanSummary,
  PlanPilotTimelineRow,
  summarizePlan,
} from "./planpilot-analysis";
import {
  mapBackendFacet,
  mapRepresentativeSolution,
  withFacetSelectionState,
} from "./planpilot-solution";
import {
  buildActionFilterViews,
  buildActionRowView,
  buildPlanActionViews,
  buildPlanSummaryViews,
  buildTimestepActionCounts,
  filterPlanPilotActions,
} from "./planpilot-sidebar-view";
import {
  FacetFilter,
  FacetSelection,
  isStructuralPlanPilotFacet,
  PendingFacetSelection,
  PlanPilotConstraintChange,
  PlanPilotConstraintTransaction,
  PlanPilotUiFacet,
} from "./planpilot-view.models";

interface LoadedPlan {
  number: number;
  label: string;
  facets: PlanPilotUiFacet[];
}

interface PlanLoadResult {
  number: number;
  plan?: LoadedPlan;
  error?: unknown;
  stale?: boolean;
  unavailable?: boolean;
}

type PlanPilotSidebarSection = "timeline" | "browse" | "plans";
type PlanPilotDecoratedGraphFacet = PlanPilotUiFacet & {
  visualState: PlanPilotGraphVisualState;
};

@Component({
  selector: "app-planpilot-view",
  imports: [
    AsyncPipe,
    BreadcrumbModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    PageModule,
    PlanPilotGraphComponent,
    PlanPilotSidebarActionsComponent,
    PlanPilotSidebarPlanComponent,
    PlanPilotSidebarPlansComponent,
    RouterLink,
  ],
  templateUrl: "./planpilot-view.component.html",
  styleUrl: "./planpilot-view.component.scss",
})
export class PlanPilotViewComponent implements OnInit, OnDestroy {
  private readonly facetPageSize = 40;
  private readonly initialGraphFacetLimit = 50;
  private readonly graphLimitStep = 50;
  private readonly planPageSize = 5;
  private readonly maxFacetChangesPerRequest = 50;
  private readonly maxHistoryEntries = 50;
  private readonly maxSessionHorizon = 100;
  private readonly fullscreenBodyClass = "planpilot-fullscreen-open";
  private route = inject(ActivatedRoute);
  private planPilotService = inject(PlanPilotService);
  private document = inject(DOCUMENT);
  private bodyOverflowBeforeFullscreen = "";
  private fullscreenScrollLocked = false;
  private destroyed = false;
  private suspendedInBackForwardCache = false;
  private sessionStartGeneration = 0;
  private analysisGeneration = 0;
  @ViewChild(PlanPilotGraphComponent) graph?: PlanPilotGraphComponent;

  project$ = this.route.data.pipe(map((data) => data["project"] as Project));

  facets: PlanPilotUiFacet[] = [];
  query = "";
  activeFilter: FacetFilter = "all";
  inspectedFacetId: string | undefined;
  solutionCount = 0;
  solutionCountKnown = false;
  solutionCountLoading = false;
  solutionCountError = "";
  planPreparationLoading = false;
  planPreparationError = "";
  sessionHorizon = 0;
  canvasExpanded = false;
  activePinnedFacets: Record<string, PlanPilotUiFacet> = {};
  knownFacets: Record<string, PlanPilotUiFacet> = {};
  runId?: string;
  sessionStatus: "idle" | "starting" | "ready" | "failed" | "stopped" = "idle";
  sessionProject?: Project;
  sessionReused = false;
  sessionRevalidationFailed = false;
  sessionEncoding: "exact" | "bounded" = "bounded";
  sessionAbstractTimeSteps = false;
  activeSessionHorizon = 0;
  activeSessionEncoding: "exact" | "bounded" = "bounded";
  activeSessionAbstractTimeSteps = false;
  backendError?: string;
  selectionPending = false;
  queryPending = false;
  activeOperationLabel = "";
  lastSelectionMessage = "";
  lastSpaceChangeSummary = "";
  pendingSelections: Record<string, PendingFacetSelection> = {};
  representativeSolution: PlanPilotUiFacet[] = [];
  representativeSolutionLabel = "";
  currentSolutionNumber = 0;
  solutionCache: Record<number, { label: string; facets: PlanPilotUiFacet[] }> =
    {};
  facetListLimit = this.facetPageSize;
  graphFacetLimit = this.initialGraphFacetLimit;
  activeTimestep: number | "any" | null = null;
  focusedTimestep: number | "any" | null = null;
  activeSidebarSection: PlanPilotSidebarSection = "browse";
  facetImpacts: Record<string, PlanPilotFacetImpact> = {};
  impactLoading = false;
  impactError = "";
  impactNotice = "";
  requiredActions: PlanPilotUiFacet[] = [];
  requiredActionsLoaded = false;
  requiredActionsLoading = false;
  requiredActionsError = "";
  undoStack: PlanPilotConstraintTransaction[] = [];
  redoStack: PlanPilotConstraintTransaction[] = [];
  planPageStart = 1;
  loadedPlanNumbers: number[] = [];
  planPageLoading = false;
  planPageError = "";
  comparisonPlanA = 1;
  comparisonPlanB = 2;
  comparison?: PlanPilotComparison;
  comparisonLoading = false;
  comparisonError = "";
  selectionRevision = 0;

  readonly filters: { value: FacetFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "open", label: "Alternatives" },
    { value: "selected", label: "Required" },
    { value: "excluded", label: "Forbidden" },
  ];

  readonly sidebarSections: PlanPilotSidebarSection[] = [
    "timeline",
    "browse",
    "plans",
  ];

  get activeConstraints(): PlanPilotUiFacet[] {
    return this.facets.filter((facet) => this.isUserConstraint(facet));
  }

  get pendingSelectionEntries(): PendingFacetSelection[] {
    return Object.values(this.pendingSelections).sort(
      (left, right) =>
        left.timestep - right.timestep || left.label.localeCompare(right.label),
    );
  }

  get pendingSelectionCount(): number {
    return this.pendingSelectionEntries.length;
  }

  get displayedSessionHorizon(): number {
    return this.activeSessionHorizon || this.sessionHorizon;
  }

  get displayedSessionEncoding(): "exact" | "bounded" {
    return this.runId && this.activeSessionHorizon > 0
      ? this.activeSessionEncoding
      : this.sessionEncoding;
  }

  get selectedConstraintCount(): number {
    return this.facets.filter(
      (facet) => facet.selection === "positive" && this.isUserConstraint(facet),
    ).length;
  }

  get excludedConstraintCount(): number {
    return this.facets.filter(
      (facet) => facet.selection === "negative" && this.isUserConstraint(facet),
    ).length;
  }

  get remainingFacetCount(): number {
    const displayedPlanIds = new Set(
      this.representativeSolution.map((facet) => facet.id),
    );
    return this.facets.filter(
      (facet) =>
        facet.available &&
        facet.selectable !== false &&
        facet.selection === "neutral" &&
        facet.facetType !== "implied" &&
        facet.facetType !== "empty" &&
        !this.isStructuralFacet(facet) &&
        !displayedPlanIds.has(facet.id),
    ).length;
  }

  get matchingFacets(): PlanPilotUiFacet[] {
    return filterPlanPilotActions(
      this.facets,
      this.activeTimestep,
      this.activeFilter,
      this.query,
      new Set(this.representativeSolution.map((facet) => facet.id)),
    ).sort((left, right) => this.compareFacets(left, right));
  }

  get visibleFacets(): PlanPilotUiFacet[] {
    return this.matchingFacets.slice(0, this.facetListLimit);
  }

  get graphFacets(): PlanPilotDecoratedGraphFacet[] {
    const baseFacets = this.facets.filter(
      (facet) =>
        facet.nodeType === "root" ||
        facet.available ||
        (facet.selection !== "neutral" && facet.facetType !== "implied") ||
        facet.id === this.inspectedFacetId,
    );
    const solutionById = new Map(
      this.representativeSolution.map((facet) => [facet.id, facet]),
    );
    const mergedBase = baseFacets.map((facet): PlanPilotUiFacet => {
      const solutionFacet = solutionById.get(facet.id);
      return solutionFacet && facet.nodeType !== "root"
        ? { ...facet, parentId: solutionFacet.parentId, solutionContext: true }
        : facet;
    });
    const baseIds = new Set(mergedBase.map((facet) => facet.id));
    const goalFacet = this.representativeSolution.length
      ? this.goalFacet(
          this.representativeSolution[this.representativeSolution.length - 1],
        )
      : undefined;
    const merged = [
      ...mergedBase,
      ...this.representativeSolution.filter((facet) => !baseIds.has(facet.id)),
      ...(goalFacet ? [goalFacet] : []),
    ];
    if (merged.length <= this.graphFacetLimit) {
      return merged.map((facet) => this.decorateGraphFacet(facet));
    }
    const mandatory = merged.filter(
      (facet) =>
        facet.nodeType === "root" ||
        facet.nodeType === "goal" ||
        (facet.selection !== "neutral" && facet.facetType !== "implied") ||
        facet.solutionContext ||
        facet.id === this.inspectedFacetId,
    );
    const mandatoryIds = new Set(mandatory.map((facet) => facet.id));
    const neutralByTimestep = new Map<number, PlanPilotUiFacet[]>();
    merged
      .filter((facet) => !mandatoryIds.has(facet.id))
      .sort((left, right) => this.compareFacets(left, right))
      .forEach((facet) => {
        neutralByTimestep.set(facet.timestep, [
          ...(neutralByTimestep.get(facet.timestep) ?? []),
          facet,
        ]);
      });
    const optionalCapacity = Math.max(
      0,
      this.graphFacetLimit - mandatory.length,
    );
    const optional = this.takeFacetsRoundRobin(
      neutralByTimestep,
      optionalCapacity,
    );
    const visibleIds = new Set([
      ...mandatoryIds,
      ...optional.slice(0, optionalCapacity).map((facet) => facet.id),
    ]);

    return merged
      .filter((facet) => visibleIds.has(facet.id))
      .map((facet) => this.decorateGraphFacet(facet));
  }

  get totalGraphDomainFacetCount(): number {
    const ids = new Set([
      ...this.facets
        .filter((facet) => !this.isStructuralFacet(facet))
        .map((facet) => facet.id),
      ...this.representativeSolution
        .filter((facet) => !this.isStructuralFacet(facet))
        .map((facet) => facet.id),
    ]);
    return ids.size;
  }

  get displayedGraphDomainFacetCount(): number {
    return this.graphFacets.filter((facet) => !this.isStructuralFacet(facet))
      .length;
  }

  get hiddenGraphFacetCount(): number {
    return Math.max(
      0,
      this.totalGraphDomainFacetCount - this.displayedGraphDomainFacetCount,
    );
  }

  get graphLimitExpanded(): boolean {
    return this.graphFacetLimit > this.initialGraphFacetLimit;
  }

  get forcedSuffixMessage(): string {
    if (this.solutionCount !== 1 || !this.representativeSolution.length) {
      return "";
    }
    const alternativeTimesteps = this.facets
      .filter(
        (facet) =>
          facet.available &&
          facet.selection === "neutral" &&
          !this.isStructuralFacet(facet),
      )
      .map((facet) => facet.timestep);
    const lastAlternative = alternativeTimesteps.length
      ? Math.max(...alternativeTimesteps)
      : 0;
    const forcedActions = this.representativeSolution.filter(
      (facet) => facet.timestep > lastAlternative,
    );
    if (!forcedActions.length) {
      return "";
    }
    return lastAlternative > 0
      ? `1 plan left. No alternatives after t${lastAlternative}.`
      : "1 plan left. No alternatives.";
  }

  get inspectedFacet(): PlanPilotUiFacet | undefined {
    const backendFacet = this.facets.find(
      (facet) => facet.id === this.inspectedFacetId,
    );
    const solutionFacet = this.representativeSolution.find(
      (facet) => facet.id === this.inspectedFacetId,
    );
    if (backendFacet && solutionFacet) {
      return {
        ...backendFacet,
        parentId: solutionFacet.parentId,
        solutionContext: true,
      };
    }
    return solutionFacet ?? backendFacet;
  }

  get graphConnections(): PlanPilotGraphConnection[] {
    const visibleDomainFacets = this.graphFacets.filter(
      (facet) => facet.nodeType !== "root" && facet.nodeType !== "time",
    );
    return buildPlanPilotViewGraphConnections(visibleDomainFacets);
  }

  get sessionStatusLabel(): string {
    switch (this.sessionStatus) {
      case "starting":
        return "Starting";
      case "ready":
        return this.sessionReused ? "Reused session" : "Ready";
      case "failed":
        return "Unavailable";
      case "stopped":
        return "Stopped";
      default:
        return "Not started";
    }
  }

  get canUseSession(): boolean {
    return this.sessionStatus === "ready" && Boolean(this.runId);
  }

  get isBusy(): boolean {
    return (
      this.sessionStatus === "starting" ||
      this.selectionPending ||
      this.queryPending ||
      this.solutionCountLoading ||
      this.planPreparationLoading ||
      this.impactLoading ||
      this.requiredActionsLoading ||
      this.planPageLoading ||
      this.comparisonLoading
    );
  }

  get sessionConfigurationChanged(): boolean {
    return (
      this.sessionHorizon !== this.activeSessionHorizon ||
      this.sessionEncoding !== this.activeSessionEncoding ||
      this.sessionAbstractTimeSteps !== this.activeSessionAbstractTimeSteps
    );
  }

  get timelineRows(): PlanPilotTimelineRow[] {
    return buildTimelineRows(
      this.facets,
      this.representativeSolution,
      this.displayedSessionHorizon,
    );
  }

  get inspectedFacetImpact(): PlanPilotFacetImpact | undefined {
    return this.inspectedFacetId
      ? this.facetImpacts[this.inspectedFacetId]
      : undefined;
  }

  get impactCalculated(): boolean {
    return Boolean(this.inspectedFacetImpact);
  }

  get canUndo(): boolean {
    return (
      this.undoStack.length > 0 && !this.pendingSelectionCount && !this.isBusy
    );
  }

  get canRedo(): boolean {
    return (
      this.redoStack.length > 0 && !this.pendingSelectionCount && !this.isBusy
    );
  }

  get planPageEnd(): number {
    return this.solutionCountKnown
      ? Math.min(this.solutionCount, this.planPageStart + this.planPageSize - 1)
      : this.planPageStart + this.planPageSize - 1;
  }

  get knownPlanLowerBound(): number {
    return Math.max(
      this.representativeSolution.length ? 1 : 0,
      this.currentSolutionNumber,
      ...Object.keys(this.solutionCache).map(Number),
    );
  }

  get solutionCountSummary(): string {
    if (!this.canUseSession) {
      return "—";
    }
    return this.solutionCountKnown
      ? String(this.solutionCount)
      : String(this.knownPlanLowerBound);
  }

  get planPageSummaries(): PlanPilotPlanSummary[] {
    return this.loadedPlanNumbers
      .map((number) => {
        const solution = this.solutionCache[number];
        return solution ? summarizePlan(number, solution.facets) : undefined;
      })
      .filter((summary): summary is PlanPilotPlanSummary => Boolean(summary));
  }

  get comparisonHasChanges(): boolean {
    return Boolean(
      this.comparison &&
      (this.comparison.moved.length ||
        this.comparison.onlyA.length ||
        this.comparison.onlyB.length),
    );
  }

  ngOnInit(): void {
    this.project$
      .pipe(take(1))
      .subscribe((project) => this.startSession(project));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionStartGeneration += 1;
    if (!this.suspendedInBackForwardCache) {
      this.stopSessionOnUnload();
    }
    this.restoreDocumentScroll();
  }

  @HostListener("window:pagehide", ["$event"])
  stopSessionOnUnload(event?: PageTransitionEvent): void {
    if (event?.persisted) {
      this.suspendedInBackForwardCache = true;
      return;
    }

    this.suspendedInBackForwardCache = false;
    const runId = this.runId;
    this.runId = undefined;
    if (runId) {
      this.planPilotService.stopSessionOnUnload(runId);
    }
  }

  @HostListener("window:pageshow", ["$event"])
  restoreSessionFromBackForwardCache(event: PageTransitionEvent): void {
    if (!event.persisted) {
      return;
    }

    this.suspendedInBackForwardCache = false;
    const runId = this.runId;
    if (!runId) {
      if (this.sessionProject) {
        this.startSession(this.sessionProject);
      }
      return;
    }

    this.revalidateCurrentSession();
  }

  revalidateCurrentSession(): void {
    const runId = this.runId;
    if (!runId || this.queryPending) {
      return;
    }

    this.queryPending = true;
    this.activeOperationLabel = "Checking PlanPilot session";
    this.sessionRevalidationFailed = false;
    this.planPilotService
      .revalidateSession$(runId)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          if (this.destroyed || this.runId !== runId) {
            return;
          }
          this.selectionRevision = response.selectionRevision;
          this.applySessionSummary(response);
          this.sessionStatus = "ready";
          this.sessionRevalidationFailed = false;
          this.backendError = undefined;
          this.lastSelectionMessage = "PlanPilot session restored.";
          this.queryPending = false;
          this.activeOperationLabel = "";
          setTimeout(() => this.graph?.fitGraph());
        },
        error: (error: unknown) => {
          if (this.destroyed || this.runId !== runId) {
            return;
          }
          this.queryPending = false;
          this.activeOperationLabel = "";
          if (!this.isExpiredSessionError(error)) {
            this.sessionStatus = "ready";
            this.sessionRevalidationFailed = true;
            this.backendError =
              "Could not check the PlanPilot session. The current session was kept; try again.";
            return;
          }
          const project = this.sessionProject;
          this.clearSessionState();
          if (project) {
            this.startSession(project);
          } else {
            this.sessionStatus = "failed";
            this.backendError =
              "The PlanPilot session expired. Return to the project and start it again.";
          }
        },
      });
  }

  @HostListener("document:keydown.escape")
  exitFullscreenWithEscape(): void {
    if (this.canvasExpanded) {
      this.toggleCanvasExpanded();
    }
  }

  setFilter(filter: FacetFilter): void {
    this.activeFilter = filter;
    this.facetListLimit = this.facetPageSize;
  }

  selectFacet(facetId: string): void {
    if (
      !this.facets.some(
        (facet) => facet.id === facetId && !this.isStructuralFacet(facet),
      )
    ) {
      return;
    }

    this.inspectedFacetId = facetId;
    setTimeout(() => {
      this.graph?.focusFacet(facetId);
    });
  }

  clearInspectedFacet(): void {
    this.inspectedFacetId = undefined;
  }

  openInspectedFacetInActions(): void {
    if (this.inspectedFacetId) {
      this.activeSidebarSection = "browse";
    }
  }

  showSidebarSection(section: PlanPilotSidebarSection): void {
    this.activeSidebarSection = section;
    if (
      section === "plans" &&
      this.runId &&
      !this.isBusy &&
      this.planPageSummaries.length < this.planPageEnd - this.planPageStart + 1
    ) {
      this.loadPlanPage(this.planPageStart);
    }
  }

  handleSidebarTabKey(
    event: KeyboardEvent,
    section: PlanPilotSidebarSection,
  ): void {
    const currentIndex = this.sidebarSections.indexOf(section);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % this.sidebarSections.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + this.sidebarSections.length) %
        this.sidebarSections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = this.sidebarSections.length - 1;
    }
    if (nextIndex === undefined) {
      return;
    }

    event.preventDefault();
    const nextSection = this.sidebarSections[nextIndex];
    this.showSidebarSection(nextSection);
    setTimeout(() =>
      this.document.getElementById(`planpilot-${nextSection}-tab`)?.focus(),
    );
  }

  showMoreFacets(): void {
    this.facetListLimit += this.facetPageSize;
  }

  showAllFacets(): void {
    this.facetListLimit = this.matchingFacets.length;
  }

  collapseFacetList(): void {
    this.facetListLimit = this.facetPageSize;
  }

  showMoreGraphFacets(): void {
    this.graphFacetLimit += this.graphLimitStep;
    setTimeout(() => this.graph?.resizeAndFit());
  }

  showAllGraphFacets(): void {
    this.graphFacetLimit = Number.MAX_SAFE_INTEGER;
    setTimeout(() => this.graph?.resizeAndFit());
  }

  collapseGraphFacets(): void {
    this.graphFacetLimit = this.initialGraphFacetLimit;
    setTimeout(() => this.graph?.resizeAndFit());
  }

  updateSessionHorizon(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value)) {
      this.sessionHorizon = Math.min(
        this.maxSessionHorizon,
        Math.max(1, value),
      );
    }
  }

  updateSessionEncoding(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "bounded" || value === "exact") {
      this.sessionEncoding = value;
    }
  }

  updateAbstractTimeSteps(event: Event): void {
    this.sessionAbstractTimeSteps = (event.target as HTMLInputElement).checked;
  }

  focusTimelineTimestep(key: number | "any"): void {
    this.focusedTimestep = key;
    this.graph?.focusTimestep(key);
  }

  showActionsAtTimestep(key: number | "any"): void {
    this.activeTimestep = key;
    this.facetListLimit = this.facetPageSize;
    this.activeSidebarSection = "browse";
  }

  clearTimestepFilter(): void {
    this.activeTimestep = null;
    this.facetListLimit = this.facetPageSize;
  }

  get timestepActionCounts(): Record<string, number> {
    return buildTimestepActionCounts(this.facets);
  }

  get actionBrowserView() {
    const displayedFacetIds = new Set(
      this.representativeSolution.map((facet) => facet.id),
    );
    const matching = filterPlanPilotActions(
      this.facets,
      this.activeTimestep,
      this.activeFilter,
      this.query,
      displayedFacetIds,
    ).sort((left, right) => this.compareFacets(left, right));
    const visible = matching.slice(0, this.facetListLimit);
    return {
      rows: visible.map((facet) => this.actionRowView(facet)),
      filters: buildActionFilterViews(
        this.facets,
        this.activeTimestep,
        this.query,
        this.filters,
        displayedFacetIds,
      ),
      matchingCount: matching.length,
      hiddenCount: Math.max(0, matching.length - visible.length),
    };
  }

  get selectedActionView(): PlanPilotSelectedActionView | undefined {
    const facet = this.inspectedFacet;
    if (!facet) {
      return undefined;
    }
    const impact = this.inspectedFacetImpact;
    return {
      ...this.actionRowView(facet),
      canRequire: this.canRequireFacet(facet),
      canForbid: this.canForbidFacet(facet),
      canClear: this.canClearFacet(facet),
      canPreviewImpact: this.canPreviewFacetImpact(facet),
      clearHint: this.clearFacetHint(facet),
      requireImpact: impact
        ? this.actionImpactView(
            impact.require,
            impact.forbid,
            impact.comparableToCurrent,
          )
        : undefined,
      forbidImpact: impact
        ? this.actionImpactView(
            impact.forbid,
            impact.require,
            impact.comparableToCurrent,
          )
        : undefined,
    };
  }

  get displayedPlanActionViews() {
    return buildPlanActionViews(this.representativeSolution, (facet) =>
      this.timestepLabel(facet),
    );
  }

  get commonActionViews() {
    return buildPlanActionViews(
      this.requiredActions,
      (facet) => this.timestepLabel(facet),
      (facet) => this.isRequiredActionVisible(facet),
    );
  }

  get planSummaryViews() {
    return buildPlanSummaryViews(this.planPageSummaries, (summary) =>
      this.planSummaryText(summary),
    );
  }

  updateQueryValue(query: string): void {
    this.query = query;
    this.facetListLimit = this.facetPageSize;
  }

  applyActionSelection(event: {
    facetId: string;
    selection: FacetSelection;
  }): void {
    this.applyFacetSelection(event.facetId, event.selection);
  }

  updatePlanComparison(event: { event: Event; side: "a" | "b" }): void {
    this.updateComparisonPlan(event.event, event.side);
  }

  isRequiredActionVisible(action: PlanPilotUiFacet): boolean {
    return this.facets.some(
      (facet) => facet.id === action.id && !this.isStructuralFacet(facet),
    );
  }

  planSummaryText(summary: PlanPilotPlanSummary): string {
    const actionText = `${summary.actionCount} action${summary.actionCount === 1 ? "" : "s"}`;
    const gapText = summary.gapTimesteps.length
      ? summary.gapTimesteps.map((timestep) => `empty t${timestep}`).join(", ")
      : "no empty timesteps between actions";
    return `${actionText} · ${gapText}`;
  }

  calculateImpact(): void {
    const facet = this.inspectedFacet;
    if (!this.runId || !facet || this.isBusy) {
      return;
    }
    if (this.facetImpacts[facet.id]) {
      this.lastSelectionMessage =
        "Impact is already available for the current plan space.";
      return;
    }

    if (this.isFixedDisplayedPlanFacet(facet)) {
      const count = this.solutionCountKnown ? this.solutionCount : null;
      this.facetImpacts = {
        [facet.id]: this.fixedDisplayedPlanImpact(count),
      };
      this.impactError = "";
      this.impactNotice =
        count === null
          ? "This action is fixed. An exact plan count is not available."
          : "";
      this.lastSelectionMessage =
        "This action occurs in every plan in the current space.";
      return;
    }

    const runId = this.runId;
    const generation = this.analysisGeneration;
    const revision = this.selectionRevision;
    this.impactLoading = true;
    this.impactError = "";
    this.impactNotice = "";
    this.activeOperationLabel = "Calculating action impact";
    this.planPilotService.selectionImpact$(runId, facet.id).subscribe({
      next: (response) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        if (response.selectionRevision !== revision) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        const result = response.result;
        if (
          result.type !== "selectionImpact" ||
          result.facetId !== facet.id ||
          !result.require ||
          !result.forbid
        ) {
          this.impactError = "PlanPilot returned an invalid impact result.";
          this.impactLoading = false;
          this.activeOperationLabel = "";
          return;
        }
        if (response.solutionCount !== null) {
          this.applySolutionCount(response.solutionCount);
        }
        this.facetImpacts = {
          [facet.id]: {
            exact: result.exact === true,
            comparableToCurrent: result.comparableToCurrent === true,
            require: {
              available: result.require.available,
              planReduction: result.require.planReduction,
              plansRemaining: result.require.plansRemaining,
              facetReduction: null,
              facetsRemaining: null,
            },
            forbid: {
              available: result.forbid.available,
              planReduction: result.forbid.planReduction,
              plansRemaining: result.forbid.plansRemaining,
              facetReduction: null,
              facetsRemaining: null,
            },
          },
        };
        this.impactNotice = result.exact
          ? ""
          : "Exact counts took too long. Availability is shown instead.";
        this.impactLoading = false;
        this.activeOperationLabel = "";
        this.lastSelectionMessage =
          "Action impact calculated for the current plan space.";
      },
      error: (error) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        this.impactError = this.errorMessage(error);
        this.impactNotice = "";
        this.impactLoading = false;
        this.activeOperationLabel = "";
      },
    });
  }

  loadRequiredActions(): void {
    if (!this.runId || this.isBusy || this.requiredActionsLoaded) {
      return;
    }

    const runId = this.runId;
    const generation = this.analysisGeneration;
    const revision = this.selectionRevision;
    this.requiredActionsLoading = true;
    this.requiredActionsError = "";
    this.activeOperationLabel = "Finding required actions";
    this.planPilotService.query$(runId, "impliedFacets").subscribe({
      next: (response) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        if (response.selectionRevision !== revision) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        this.requiredActions = (response.result.facets ?? [])
          .filter((facet) => !this.isStateFacet(facet))
          .map((facet, index) => this.toPlanPilotUiFacet(facet, index))
          .filter((facet) => facet.facetType === "implied")
          .sort((left, right) => this.compareFacets(left, right));
        this.requiredActionsLoaded = true;
        this.requiredActionsLoading = false;
        this.activeOperationLabel = "";
      },
      error: (error) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        this.requiredActionsError = this.errorMessage(error);
        this.requiredActionsLoading = false;
        this.activeOperationLabel = "";
      },
    });
  }

  loadPlanPage(start = this.planPageStart, solutionToShow?: number): void {
    if (!this.runId || this.isBusy) {
      return;
    }
    const requestedStart =
      Math.floor((Math.max(1, start) - 1) / this.planPageSize) *
        this.planPageSize +
      1;
    const lastPageStart = this.solutionCountKnown
      ? this.planPageStartFor(this.solutionCount)
      : requestedStart;
    const normalizedStart = Math.min(requestedStart, lastPageStart);
    const pageLength = this.solutionCountKnown
      ? Math.min(
          this.planPageSize,
          Math.max(0, this.solutionCount - normalizedStart + 1),
        )
      : this.planPageSize;
    const numbers = Array.from(
      { length: pageLength },
      (_, index) => normalizedStart + index,
    );
    if (!numbers.length) {
      return;
    }
    const queryOrder = [...numbers].reverse();
    const runId = this.runId;
    const generation = this.analysisGeneration;
    this.planPageLoading = true;
    this.planPageError = "";
    this.activeOperationLabel = `Loading plans ${numbers[0]}–${numbers[numbers.length - 1]}`;
    this.loadPlanResultsHighestFirst$(runId, queryOrder).subscribe({
      next: (results) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        if (results.some((result) => result.stale)) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        const errors: string[] = [];
        results.forEach((result) => {
          if (result.plan) {
            this.solutionCache[result.number] = {
              label: result.plan.label,
              facets: result.plan.facets.map((facet) => ({ ...facet })),
            };
          } else if (result.error && !result.unavailable) {
            errors.push(
              `Plan ${result.number}: ${this.errorMessage(result.error)}`,
            );
          }
        });
        this.planPageStart = normalizedStart;
        this.loadedPlanNumbers = numbers.filter((number) =>
          Boolean(this.solutionCache[number]),
        );
        this.planPageError = errors.join(" ");
        this.planPageLoading = false;
        this.activeOperationLabel = "";
        if (
          this.solutionCountKnown &&
          (normalizedStart > this.solutionCount ||
            (solutionToShow !== undefined &&
              solutionToShow > this.solutionCount))
        ) {
          this.lastSelectionMessage = `This plan space contains ${this.solutionCount} plan${this.solutionCount === 1 ? "" : "s"}. Showing the last page.`;
          const finalPageStart = this.planPageStartFor(this.solutionCount);
          if (normalizedStart !== finalPageStart) {
            this.loadPlanPage(finalPageStart);
          }
          return;
        }
        if (solutionToShow !== undefined) {
          this.showSolution(solutionToShow);
        }
      },
      error: (error) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        this.planPageError = this.errorMessage(error);
        this.planPageLoading = false;
        this.activeOperationLabel = "";
      },
    });
  }

  previousPlanPage(): void {
    this.loadPlanPage(Math.max(1, this.planPageStart - this.planPageSize));
  }

  nextPlanPage(): void {
    this.loadPlanPage(this.planPageStart + this.planPageSize);
  }

  jumpToSolution(solutionNumber: number): void {
    if (
      !Number.isSafeInteger(solutionNumber) ||
      solutionNumber < 1 ||
      (this.solutionCountKnown && solutionNumber > this.solutionCount)
    ) {
      return;
    }
    this.loadPlanPage(this.planPageStartFor(solutionNumber), solutionNumber);
  }

  preparePlansThrough(solutionNumber: number): void {
    if (
      !this.runId ||
      this.isBusy ||
      this.sessionConfigurationChanged ||
      this.pendingSelectionCount > 0 ||
      !Number.isSafeInteger(solutionNumber) ||
      solutionNumber < 1 ||
      (this.solutionCountKnown && solutionNumber > this.solutionCount)
    ) {
      return;
    }

    const runId = this.runId;
    const generation = this.analysisGeneration;
    this.planPreparationLoading = true;
    this.planPreparationError = "";
    this.activeOperationLabel = `Preparing plans 1–${solutionNumber}`;
    this.loadPlanResult$(runId, solutionNumber)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          if (this.runId !== runId || this.analysisGeneration !== generation) {
            return;
          }
          if (result.stale) {
            this.refreshAfterStaleQuery(runId);
            return;
          }
          if (result.error) {
            this.planPreparationError = this.errorMessage(result.error);
          } else if (result.plan) {
            this.solutionCache[result.number] = {
              label: result.plan.label,
              facets: result.plan.facets.map((facet) => ({ ...facet })),
            };
            this.lastSelectionMessage = `Plans 1–${solutionNumber} are ready to browse.`;
          } else if (this.solutionCountKnown) {
            this.lastSelectionMessage = `This plan space contains ${this.solutionCount} plan${this.solutionCount === 1 ? "" : "s"}.`;
          } else {
            this.planPreparationError = `Plan ${solutionNumber} is not available.`;
          }
          this.planPreparationLoading = false;
          this.activeOperationLabel = "";
        },
        error: (error) => {
          if (this.runId !== runId || this.analysisGeneration !== generation) {
            return;
          }
          this.planPreparationError = this.errorMessage(error);
          this.planPreparationLoading = false;
          this.activeOperationLabel = "";
        },
      });
  }

  private planPageStartFor(solutionNumber: number): number {
    return (
      Math.floor((Math.max(1, solutionNumber) - 1) / this.planPageSize) *
        this.planPageSize +
      1
    );
  }

  updateComparisonPlan(event: Event, side: "a" | "b"): void {
    const requested = Number((event.target as HTMLInputElement).value);
    if (!Number.isSafeInteger(requested) || requested < 1) {
      return;
    }
    const value = this.solutionCountKnown
      ? Math.min(this.solutionCount, requested)
      : requested;
    if (side === "a") {
      this.comparisonPlanA = value;
    } else {
      this.comparisonPlanB = value;
    }
    this.comparison = undefined;
    this.comparisonError = "";
  }

  compareSelectedPlans(): void {
    if (
      !this.runId ||
      (this.solutionCountKnown && this.solutionCount < 2) ||
      this.comparisonPlanA === this.comparisonPlanB ||
      this.isBusy
    ) {
      return;
    }
    const runId = this.runId;
    const generation = this.analysisGeneration;
    const planA = this.comparisonPlanA;
    const planB = this.comparisonPlanB;
    this.comparisonLoading = true;
    this.comparisonError = "";
    this.activeOperationLabel = `Comparing plans ${planA} and ${planB}`;
    this.loadPlanResultsHighestFirst$(runId, [planA, planB]).subscribe({
      next: (results) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        const resultA = results.find((result) => result.number === planA) ?? {
          number: planA,
        };
        const resultB = results.find((result) => result.number === planB) ?? {
          number: planB,
        };
        if (resultA.stale || resultB.stale) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        for (const result of [resultA, resultB]) {
          if (result.plan) {
            this.solutionCache[result.number] = {
              label: result.plan.label,
              facets: result.plan.facets.map((facet) => ({ ...facet })),
            };
          }
        }
        const cachedA = this.solutionCache[planA];
        const cachedB = this.solutionCache[planB];
        if (!cachedA || !cachedB) {
          const failed = [resultA, resultB].find(
            (result) => result.error,
          )?.error;
          this.comparisonError = failed
            ? this.errorMessage(failed)
            : "One of the selected plans is not available.";
        } else {
          this.comparison = comparePlanSolutions(
            cachedA.facets,
            cachedB.facets,
          );
        }
        this.comparisonLoading = false;
        this.activeOperationLabel = "";
      },
      error: (error) => {
        if (this.runId !== runId || this.analysisGeneration !== generation) {
          return;
        }
        this.comparisonError = this.errorMessage(error);
        this.comparisonLoading = false;
        this.activeOperationLabel = "";
      },
    });
  }

  private actionImpactView(
    impact: PlanPilotFacetImpact["require"] | PlanPilotFacetImpact["forbid"],
    counterpart:
      PlanPilotFacetImpact["require"] | PlanPilotFacetImpact["forbid"],
    comparableToCurrent: boolean,
  ) {
    const derivedTotal =
      comparableToCurrent &&
      impact.plansRemaining !== null &&
      counterpart.plansRemaining !== null
        ? impact.plansRemaining + counterpart.plansRemaining
        : null;
    const totalPlans = comparableToCurrent
      ? this.solutionCountKnown
        ? this.solutionCount
        : derivedTotal
      : null;
    return {
      available: impact.available,
      totalPlans,
      plansRemaining: impact.plansRemaining,
      plansRemoved:
        totalPlans !== null && impact.plansRemaining !== null
          ? Math.max(0, totalPlans - impact.plansRemaining)
          : null,
      reductionPercent:
        totalPlans !== null && impact.plansRemaining !== null
          ? Math.round(
              ((totalPlans - impact.plansRemaining) / totalPlans) * 10_000,
            ) / 100
          : impact.planReduction === null || !comparableToCurrent
            ? null
            : Math.round(impact.planReduction * 10_000) / 100,
    };
  }

  applySessionConfiguration(): void {
    if (
      !this.sessionProject ||
      !this.sessionConfigurationChanged ||
      this.isBusy ||
      this.pendingSelectionCount > 0
    ) {
      return;
    }

    const previousRunId = this.runId;
    if (!previousRunId) {
      this.startSession(this.sessionProject);
      return;
    }

    this.startSession(this.sessionProject, previousRunId);
  }

  showSolution(solutionNumber: number): void {
    if (
      !this.runId ||
      this.isBusy ||
      !Number.isSafeInteger(solutionNumber) ||
      solutionNumber < 1 ||
      (this.solutionCountKnown && solutionNumber > this.solutionCount)
    ) {
      return;
    }

    const cached = this.solutionCache[solutionNumber];
    if (cached) {
      this.backendError = undefined;
      this.currentSolutionNumber = solutionNumber;
      this.representativeSolutionLabel = cached.label;
      this.representativeSolution = cached.facets.map((facet) => ({
        ...facet,
      }));
      setTimeout(() => this.graph?.fitGraph());
      return;
    }

    const runId = this.runId;
    const revision = this.selectionRevision;
    this.queryPending = true;
    this.activeOperationLabel = `Loading plan ${solutionNumber}`;
    this.planPilotService.query$(runId, "solution", solutionNumber).subscribe({
      next: (response) => {
        if (this.runId !== runId) {
          return;
        }
        if (response.selectionRevision !== revision) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        if (response.solutionCount !== null) {
          this.applySolutionCount(response.solutionCount);
        }
        const solution = response.result.solutions?.[0];
        if (!solution?.facets.length) {
          this.lastSelectionMessage = `There are only ${this.solutionCount || solutionNumber - 1} plans in this space.`;
        } else {
          this.backendError = undefined;
          this.currentSolutionNumber = solutionNumber;
          this.representativeSolutionLabel = solution.label;
          this.representativeSolution = this.toRepresentativeSolution(
            solution.facets,
          );
          this.solutionCache[solutionNumber] = {
            label: this.representativeSolutionLabel,
            facets: this.representativeSolution.map((facet) => ({ ...facet })),
          };
          setTimeout(() => this.graph?.fitGraph());
        }
        this.queryPending = false;
        this.activeOperationLabel = "";
      },
      error: (error) => {
        if (this.runId !== runId) {
          return;
        }
        this.backendError = this.errorMessage(error);
        this.queryPending = false;
        this.activeOperationLabel = "";
      },
    });
  }

  selectFacetFromGraph(event: PlanPilotGraphTap): void {
    if (!event.facetId) {
      return;
    }

    this.selectFacet(event.facetId);
  }

  applyFacetSelection(facetId: string, selection: FacetSelection): void {
    const facet = this.facets.find((item) => item.id === facetId);
    const canClearConstraint =
      selection === "neutral" && Boolean(facet && this.canClearFacet(facet));
    if (
      !this.runId ||
      !facet ||
      facet.nodeType === "root" ||
      (!facet.available && !canClearConstraint) ||
      this.isBusy
    ) {
      this.backendError = "PlanPilot session is not ready.";
      return;
    }
    if (selection === "neutral" && !canClearConstraint) {
      this.lastSelectionMessage = "No user constraint is set for this action.";
      return;
    }
    if (selection !== "neutral" && facet.selectable === false) {
      this.backendError = "This action is fixed in the current plan space.";
      return;
    }

    if (facet.selection === selection) {
      this.lastSelectionMessage =
        selection === "neutral"
          ? "No user constraint is set for this action."
          : `This action is already ${selection === "positive" ? "required" : "forbidden"}.`;
      return;
    }

    const previousSelection = facet.selection;
    const targetSelection = selection;
    const existingPending = this.pendingSelections[facet.id];
    const committedSelection =
      existingPending?.previousSelection ?? previousSelection;
    const nextPendingSelections = { ...this.pendingSelections };
    let nextFacets = this.facets;

    if (targetSelection === "positive") {
      nextFacets = nextFacets.map((candidate) => {
        if (
          candidate.id === facet.id ||
          facet.abstractTimeStep ||
          candidate.abstractTimeStep ||
          candidate.timestep !== facet.timestep ||
          candidate.selection !== "positive" ||
          (!this.isUserConstraint(candidate) &&
            nextPendingSelections[candidate.id]?.selection !== "positive")
        ) {
          return candidate;
        }

        const candidatePending = nextPendingSelections[candidate.id];
        const candidateCommitted =
          candidatePending?.previousSelection ?? candidate.selection;
        if (candidateCommitted === "neutral") {
          delete nextPendingSelections[candidate.id];
        } else {
          nextPendingSelections[candidate.id] = {
            facetId: candidate.id,
            label: candidate.label,
            timestep: candidate.timestep,
            selection: "neutral",
            previousSelection: candidateCommitted,
          };
        }
        return this.withSelectionState(candidate, "neutral");
      });
    }

    if (targetSelection === committedSelection) {
      delete nextPendingSelections[facet.id];
    } else {
      nextPendingSelections[facet.id] = {
        facetId,
        label: facet.label,
        timestep: facet.timestep,
        selection: targetSelection,
        previousSelection: committedSelection,
      };
    }

    this.pendingSelections = nextPendingSelections;
    this.facets = nextFacets.map((item) =>
      item.id === facetId
        ? this.withSelectionState(item, targetSelection)
        : item,
    );
    this.inspectedFacetId = facetId;
    const stagedAction =
      targetSelection === "neutral"
        ? `Clear ${facet.label}`
        : `${this.selectionLabel(targetSelection)} ${facet.label}`;
    this.lastSelectionMessage = `${stagedAction} staged. Click Apply to update the graph.`;
  }

  computeStagedSelections(): void {
    const stagedSelections = this.pendingSelectionEntries;
    if (!this.runId || stagedSelections.length === 0) {
      return;
    }
    const runId = this.runId;
    if (stagedSelections.length > this.maxFacetChangesPerRequest) {
      this.backendError = `Apply at most ${this.maxFacetChangesPerRequest} changes at once.`;
      return;
    }
    const transaction: PlanPilotConstraintTransaction = {
      label: this.transactionLabel(
        stagedSelections.map((selection) => ({
          facetId: selection.facetId,
          label: selection.label,
          timestep: selection.timestep,
          from: selection.previousSelection,
          to: selection.selection,
        })),
      ),
      changes: stagedSelections.map((selection) => ({
        facetId: selection.facetId,
        label: selection.label,
        timestep: selection.timestep,
        from: selection.previousSelection,
        to: selection.selection,
      })),
    };

    this.selectionPending = true;
    this.activeOperationLabel = `Applying ${stagedSelections.length} staged change${stagedSelections.length === 1 ? "" : "s"}`;
    this.lastSelectionMessage = `Applying ${stagedSelections.length} change${stagedSelections.length === 1 ? "" : "s"}`;

    this.planPilotService
      .applyFacets$(runId, {
        expectedSelectionRevision: this.selectionRevision,
        selections: stagedSelections.map((selection) => ({
          facetId: selection.facetId,
          selectionState: selection.selection,
          previousSelectionState: selection.previousSelection,
        })),
      })
      .subscribe({
        next: (response) => {
          if (this.runId !== runId) {
            return;
          }
          this.backendError = undefined;
          stagedSelections.forEach((selection) => {
            const facet =
              this.facets.find((item) => item.id === selection.facetId) ??
              this.knownFacets[selection.facetId];
            if (facet) {
              this.updatePinnedFacet(facet, selection.selection);
            }
          });
          this.pendingSelections = {};
          this.applySelectionSnapshot(response, true);
          this.pushUndoTransaction(transaction);
          this.redoStack = [];
          this.selectionPending = false;
          this.activeOperationLabel = "";
          this.lastSelectionMessage = `${stagedSelections.length} change${stagedSelections.length === 1 ? "" : "s"} applied.`;
          setTimeout(() => this.graph?.fitGraph());
        },
        error: (error) => {
          if (this.runId !== runId) {
            return;
          }
          if (this.isSelectionConflict(error)) {
            this.pendingSelections = {};
            this.facets = this.facets.map((facet) => {
              const staged = stagedSelections.find(
                (selection) => selection.facetId === facet.id,
              );
              return staged
                ? this.withSelectionState(facet, staged.previousSelection)
                : facet;
            });
            this.activePinnedFacets = {};
            this.knownFacets = {};
            this.undoStack = [];
            this.redoStack = [];
            this.backendError = undefined;
            this.lastSelectionMessage =
              "The plan space changed. Facets were reloaded; please select your changes again.";
            this.selectionPending = false;
            this.activeOperationLabel = "";
            this.refreshFacets();
            return;
          }
          this.backendError = this.errorMessage(error);
          this.lastSelectionMessage =
            "Changes were not applied. Review the selected actions and try again.";
          this.selectionPending = false;
          this.activeOperationLabel = "";
        },
      });
  }

  discardStagedSelections(): void {
    const stagedSelections = this.pendingSelectionEntries;
    if (stagedSelections.length === 0) {
      return;
    }

    this.pendingSelections = {};
    this.facets = this.facets.map((facet) => {
      const staged = stagedSelections.find(
        (selection) => selection.facetId === facet.id,
      );
      return staged
        ? this.withSelectionState(facet, staged.previousSelection)
        : facet;
    });
    this.lastSelectionMessage = "Changes discarded.";
  }

  undoConstraintChange(): void {
    const transaction = this.undoStack[this.undoStack.length - 1];
    if (!transaction || !this.canUndo) {
      return;
    }
    this.applyHistoryTransaction(transaction, "undo");
  }

  redoConstraintChange(): void {
    const transaction = this.redoStack[this.redoStack.length - 1];
    if (!transaction || !this.canRedo) {
      return;
    }
    this.applyHistoryTransaction(transaction, "redo");
  }

  toggleCanvasExpanded(): void {
    this.canvasExpanded = !this.canvasExpanded;
    if (this.canvasExpanded) {
      this.bodyOverflowBeforeFullscreen = this.document.body.style.overflow;
      this.document.body.style.overflow = "hidden";
      this.document.body.classList.add(this.fullscreenBodyClass);
      this.fullscreenScrollLocked = true;
    } else {
      this.restoreDocumentScroll();
    }
    setTimeout(() => this.graph?.resizeAndFit());
  }

  zoomIn(): void {
    this.graph?.zoomIn();
  }

  zoomOut(): void {
    this.graph?.zoomOut();
  }

  exportGraphDiagnostic(): void {
    const payload = this.buildGraphDiagnostic();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = this.document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = this.graphDiagnosticFilename(payload.generatedAt);
    anchor.style.display = "none";
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    this.lastSelectionMessage = "Graph data exported.";
  }

  buildGraphDiagnostic(): PlanPilotGraphDiagnostic {
    const graphFacets = this.graphFacets;
    const connections = this.graphConnections;
    return buildPlanPilotGraphDiagnostic({
      generatedAt: new Date().toISOString(),
      location: window.location.pathname,
      applicationAssets: javascriptAssetNames(
        Array.from(this.document.scripts).map((script) => script.src),
        this.document.baseURI,
      ),
      browser: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        userAgent: window.navigator.userAgent,
      },
      project: {
        id: this.sessionProject?._id,
        name: this.sessionProject?.name,
      },
      session: {
        runId: this.runId,
        status: this.sessionStatus,
        reused: this.sessionReused,
        encoding: this.displayedSessionEncoding,
        abstractTimeSteps: this.activeSessionAbstractTimeSteps,
        horizon: this.displayedSessionHorizon,
        solutionCount: this.solutionCountKnown ? this.solutionCount : null,
        solutionCountKnown: this.solutionCountKnown,
        currentSolutionNumber: this.currentSolutionNumber,
        backendError: this.backendError,
      },
      ui: {
        selectedFacetId: this.inspectedFacetId,
        activeFilter: this.activeFilter,
        searchQuery: this.query,
        fullscreen: this.canvasExpanded,
        busy: this.isBusy,
        pendingSelections: this.pendingSelectionEntries,
        activePinnedFacetIds: Object.keys(this.activePinnedFacets),
        lastSelectionMessage: this.lastSelectionMessage,
        lastSpaceChangeSummary: this.lastSpaceChangeSummary,
        facetListLimit: this.facetListLimit,
        graphFacetLimit: this.graphFacetLimit,
        graphLimitExpanded: this.graphLimitExpanded,
        connectionModel: "representative-solution-only",
      },
      allFacets: this.facets,
      graphFacets,
      representativeSolution: this.representativeSolution,
      connections,
      renderedGraph: this.graph?.exportSnapshot(),
    });
  }

  resetSessionView(): void {
    this.discardStagedSelections();
    const activeSelections = this.activeConstraints;
    this.activeFilter = "all";
    this.query = "";
    this.facetListLimit = this.facetPageSize;
    this.graphFacetLimit = this.initialGraphFacetLimit;
    this.lastSpaceChangeSummary = "";

    if (this.runId && activeSelections.length) {
      const runId = this.runId;
      if (activeSelections.length > this.maxFacetChangesPerRequest) {
        this.backendError = `Remove at most ${this.maxFacetChangesPerRequest} constraints at once.`;
        return;
      }
      const transaction: PlanPilotConstraintTransaction = {
        label: "Clear all constraints",
        changes: activeSelections.map((facet) => ({
          facetId: facet.id,
          label: facet.label,
          timestep: facet.timestep,
          from: facet.selection,
          to: "neutral",
        })),
      };
      this.selectionPending = true;
      this.activeOperationLabel = "Removing constraints";
      this.lastSelectionMessage = "Removing constraints";
      this.planPilotService
        .applyFacets$(runId, {
          expectedSelectionRevision: this.selectionRevision,
          selections: activeSelections.map((facet) => ({
            facetId: facet.id,
            selectionState: "neutral",
            previousSelectionState: facet.selection,
          })),
        })
        .subscribe({
          next: (response) => {
            if (this.runId !== runId) {
              return;
            }
            this.backendError = undefined;
            this.activePinnedFacets = {};
            this.knownFacets = {};
            this.lastSelectionMessage = "All constraints removed.";
            this.selectionPending = false;
            this.activeOperationLabel = "";
            this.applySelectionSnapshot(response, true);
            this.pushUndoTransaction(transaction);
            this.redoStack = [];
            setTimeout(() => this.graph?.fitGraph());
          },
          error: (error) => {
            if (this.runId !== runId) {
              return;
            }
            if (this.isSelectionConflict(error)) {
              this.pendingSelections = {};
              this.activePinnedFacets = {};
              this.knownFacets = {};
              this.undoStack = [];
              this.redoStack = [];
              this.backendError = undefined;
              this.lastSelectionMessage =
                "The plan space changed. History was cleared and facets were reloaded.";
              this.selectionPending = false;
              this.activeOperationLabel = "";
              this.refreshFacets();
              return;
            }
            this.backendError = this.errorMessage(error);
            this.selectionPending = false;
            this.activeOperationLabel = "";
          },
        });
      return;
    }

    this.activePinnedFacets = {};
    this.knownFacets = {};
    this.lastSelectionMessage = "";
    if (this.runId) {
      this.refreshFacets();
    } else {
      setTimeout(() => this.graph?.fitGraph());
    }
  }

  stopSession(): void {
    if (!this.runId || this.selectionPending) {
      return;
    }

    const runId = this.runId;
    this.selectionPending = true;
    this.activeOperationLabel = "Stopping PlanPilot session";
    this.lastSelectionMessage = "Stopping PlanPilot session";
    this.planPilotService.stopSession$(runId).subscribe({
      next: () => {
        this.clearSessionState();
        this.sessionStatus = "stopped";
        this.selectionPending = false;
        this.activeOperationLabel = "";
        this.lastSelectionMessage = "PlanPilot session stopped";
      },
      error: (error) => {
        this.backendError = this.errorMessage(error);
        this.selectionPending = false;
        this.activeOperationLabel = "";
      },
    });
  }

  startNewSession(): void {
    if (!this.sessionProject || this.isBusy) {
      return;
    }

    this.startSession(this.sessionProject);
  }

  selectionLabel(selection: FacetSelection): string {
    switch (selection) {
      case "positive":
        return "Required by you";
      case "negative":
        return "Forbidden by you";
      default:
        return "Available";
    }
  }

  timestepLabel(facet: PlanPilotUiFacet): string {
    return facet.abstractTimeStep ? "Any step" : `t${facet.timestep}`;
  }

  facetStateLabel(facet: PlanPilotUiFacet): string {
    const pending = this.pendingSelections[facet.id]?.selection;
    const inDisplayedPlan = this.isDisplayedPlanFacet(facet);
    if (pending) {
      const pendingLabel =
        pending === "positive"
          ? "Require pending"
          : pending === "negative"
            ? "Forbid pending"
            : "Remove pending";
      return inDisplayedPlan
        ? `Displayed plan · ${pendingLabel}`
        : pendingLabel;
    }
    if (inDisplayedPlan) {
      return this.isUserConstraint(facet) && facet.selection === "positive"
        ? "Displayed plan · Required by you"
        : "Displayed plan · No constraint";
    }
    if (facet.facetType === "implied") {
      return "Occurs in every plan";
    }
    if (this.isUserConstraint(facet)) {
      return this.selectionLabel(facet.selection);
    }
    if (!facet.available) {
      return "Outside current space";
    }
    return this.selectionLabel(facet.selection);
  }

  isDisplayedPlanFacet(facet: PlanPilotUiFacet): boolean {
    return (
      Boolean(facet.solutionContext) ||
      this.representativeSolution.some((action) => action.id === facet.id)
    );
  }

  isRequiredFacet(facet: PlanPilotUiFacet): boolean {
    return (
      facet.selection === "positive" &&
      (this.pendingSelections[facet.id]?.selection === "positive" ||
        this.isUserConstraint(facet))
    );
  }

  isForbiddenFacet(facet: PlanPilotUiFacet): boolean {
    return (
      facet.selection === "negative" &&
      (this.pendingSelections[facet.id]?.selection === "negative" ||
        this.isUserConstraint(facet))
    );
  }

  canRequireFacet(facet: PlanPilotUiFacet): boolean {
    return (
      this.isBackendFacet(facet) &&
      facet.available &&
      facet.selectable !== false &&
      facet.selection !== "positive"
    );
  }

  canForbidFacet(facet: PlanPilotUiFacet): boolean {
    return (
      this.isBackendFacet(facet) &&
      facet.available &&
      facet.selectable !== false &&
      facet.selection !== "negative"
    );
  }

  canClearFacet(facet: PlanPilotUiFacet): boolean {
    return (
      this.isBackendFacet(facet) &&
      facet.selection !== "neutral" &&
      facet.facetType !== "implied" &&
      (Boolean(this.pendingSelections[facet.id]) ||
        this.isUserConstraint(facet))
    );
  }

  clearFacetHint(facet: PlanPilotUiFacet): string {
    if (this.canClearFacet(facet)) {
      return "Remove this user constraint";
    }
    if (facet.facetType === "implied") {
      return "PlanPilot found this action in every remaining plan";
    }
    return "No user constraint is set for this action";
  }

  private actionRowView(facet: PlanPilotUiFacet) {
    return buildActionRowView(facet, {
      timestepLabel: (item) => this.timestepLabel(item),
      stateLabel: (item) => this.facetStateLabel(item),
      displayedPlan: (item) => this.isDisplayedPlanFacet(item),
      required: (item) => this.isRequiredFacet(item),
      forbidden: (item) => this.isForbiddenFacet(item),
      selectedFacetId: this.inspectedFacetId,
    });
  }

  private compareFacets(
    left: PlanPilotUiFacet,
    right: PlanPilotUiFacet,
  ): number {
    return (
      Number(Boolean(left.abstractTimeStep)) -
        Number(Boolean(right.abstractTimeStep)) ||
      left.timestep - right.timestep ||
      this.facetDisplayPriority(left) - this.facetDisplayPriority(right) ||
      (right.solutionReduction ?? -1) - (left.solutionReduction ?? -1) ||
      left.label.localeCompare(right.label)
    );
  }

  private takeFacetsRoundRobin(
    facetsByTimestep: Map<number, PlanPilotUiFacet[]>,
    limit: number,
  ): PlanPilotUiFacet[] {
    const groups = Array.from(facetsByTimestep.entries())
      .sort(([left], [right]) => left - right)
      .map(([, facets]) => facets);
    const result: PlanPilotUiFacet[] = [];
    let index = 0;

    while (result.length < limit) {
      let added = false;
      for (const group of groups) {
        const facet = group[index];
        if (facet && result.length < limit) {
          result.push(facet);
          added = true;
        }
      }
      if (!added) {
        break;
      }
      index += 1;
    }

    return result;
  }

  private facetDisplayPriority(facet: PlanPilotUiFacet): number {
    if (facet.facetType === "implied") {
      return 2;
    }
    if (facet.facetType === "empty") {
      return 1;
    }
    return 0;
  }

  private loadPlanResult$(
    runId: string,
    number: number,
  ): Observable<PlanLoadResult> {
    const cached = this.solutionCache[number];
    if (cached) {
      return of({
        number,
        plan: {
          number,
          label: cached.label,
          facets: cached.facets.map((facet) => ({ ...facet })),
        },
      });
    }
    const revision = this.selectionRevision;
    return this.planPilotService.query$(runId, "solution", number).pipe(
      map((response): PlanLoadResult => {
        if (response.selectionRevision !== revision) {
          return { number, stale: true };
        }
        if (response.solutionCount !== null) {
          this.applySolutionCount(response.solutionCount);
        }
        const solution = response.result.solutions?.[0];
        if (!solution?.facets.length) {
          return {
            number,
            unavailable: true,
          };
        }
        return {
          number,
          plan: {
            number,
            label: solution.label,
            facets: this.toRepresentativeSolution(solution.facets),
          },
        };
      }),
      catchError((error: unknown) => of({ number, error })),
    );
  }

  private loadPlanResultsHighestFirst$(
    runId: string,
    numbers: number[],
  ): Observable<PlanLoadResult[]> {
    const orderedNumbers = [...new Set(numbers)].sort(
      (left, right) => right - left,
    );
    const [highest, ...remaining] = orderedNumbers;
    if (highest === undefined) {
      return of([]);
    }

    return this.loadPlanResult$(runId, highest).pipe(
      concatMap((firstResult) => {
        if (firstResult.error || firstResult.stale) {
          return of([firstResult]);
        }
        return from(remaining).pipe(
          concatMap((number) => this.loadPlanResult$(runId, number)),
          toArray(),
          map((results) => [firstResult, ...results]),
        );
      }),
    );
  }

  private applyHistoryTransaction(
    transaction: PlanPilotConstraintTransaction,
    direction: "undo" | "redo",
  ): void {
    if (
      !this.runId ||
      transaction.changes.length > this.maxFacetChangesPerRequest
    ) {
      this.backendError = `History entries may contain at most ${this.maxFacetChangesPerRequest} changes.`;
      return;
    }
    const runId = this.runId;
    const selections = transaction.changes.map((change) => ({
      facetId: change.facetId,
      selectionState: direction === "undo" ? change.from : change.to,
      previousSelectionState: direction === "undo" ? change.to : change.from,
    }));
    this.selectionPending = true;
    this.activeOperationLabel =
      direction === "undo"
        ? "Undoing constraint change"
        : "Redoing constraint change";
    this.planPilotService
      .applyFacets$(runId, {
        selections,
        expectedSelectionRevision: this.selectionRevision,
      })
      .subscribe({
        next: (response) => {
          if (this.runId !== runId) {
            return;
          }
          transaction.changes.forEach((change) => {
            const target = direction === "undo" ? change.from : change.to;
            const facet =
              this.facets.find((item) => item.id === change.facetId) ??
              this.knownFacets[change.facetId];
            if (facet) {
              this.updatePinnedFacet(facet, target);
            } else if (target === "neutral") {
              const { [change.facetId]: _, ...remaining } =
                this.activePinnedFacets;
              this.activePinnedFacets = remaining;
            }
          });
          this.pendingSelections = {};
          this.applySelectionSnapshot(response, true);
          if (direction === "undo") {
            this.undoStack = this.undoStack.slice(0, -1);
            this.redoStack = [...this.redoStack, transaction];
          } else {
            this.redoStack = this.redoStack.slice(0, -1);
            this.pushUndoTransaction(transaction);
          }
          this.backendError = undefined;
          this.selectionPending = false;
          this.activeOperationLabel = "";
          this.lastSelectionMessage = `${direction === "undo" ? "Undid" : "Redid"}: ${transaction.label}.`;
        },
        error: (error) => {
          if (this.runId !== runId) {
            return;
          }
          if (this.isSelectionConflict(error)) {
            this.undoStack = [];
            this.redoStack = [];
            this.pendingSelections = {};
            this.activePinnedFacets = {};
            this.knownFacets = {};
            this.lastSelectionMessage =
              "The plan space changed. History was cleared and facets were reloaded.";
            this.backendError = undefined;
            this.selectionPending = false;
            this.activeOperationLabel = "";
            this.refreshFacets();
            return;
          }
          this.backendError = this.errorMessage(error);
          this.selectionPending = false;
          this.activeOperationLabel = "";
        },
      });
  }

  private transactionLabel(changes: PlanPilotConstraintChange[]): string {
    if (changes.length !== 1) {
      return `${changes.length} constraint changes`;
    }
    const change = changes[0];
    const operation =
      change.to === "positive"
        ? "Require"
        : change.to === "negative"
          ? "Forbid"
          : "Remove constraint from";
    return `${operation} ${change.label}`;
  }

  private pushUndoTransaction(
    transaction: PlanPilotConstraintTransaction,
  ): void {
    this.undoStack = [...this.undoStack, transaction].slice(
      -this.maxHistoryEntries,
    );
  }

  private invalidateAnalysisState(): void {
    this.analysisGeneration += 1;
    this.facetImpacts = {};
    this.impactLoading = false;
    this.impactError = "";
    this.impactNotice = "";
    this.requiredActions = [];
    this.requiredActionsLoaded = false;
    this.requiredActionsLoading = false;
    this.requiredActionsError = "";
    this.planPageStart = 1;
    this.loadedPlanNumbers = [];
    this.planPageLoading = false;
    this.planPageError = "";
    this.planPreparationLoading = false;
    this.planPreparationError = "";
    this.comparisonPlanA = 1;
    this.comparisonPlanB = this.solutionCountKnown
      ? Math.min(2, Math.max(1, this.solutionCount))
      : 2;
    this.comparison = undefined;
    this.comparisonLoading = false;
    this.comparisonError = "";
  }

  private startSession(project: Project, replacementRunId?: string): void {
    this.sessionProject = project;
    if (this.sessionHorizon <= 0) {
      this.sessionHorizon = 1;
    }
    if (!replacementRunId) {
      this.clearSessionState();
    }
    this.sessionStatus = "starting";
    this.activeOperationLabel = replacementRunId
      ? "Trying new plan-space settings"
      : "Starting PlanPilot session";
    this.backendError = undefined;
    const startGeneration = ++this.sessionStartGeneration;
    this.planPilotService
      .startSession$({
        projectId: project._id,
        horizon: this.sessionHorizon,
        encoding: this.sessionEncoding,
        abstractTimeSteps: this.sessionAbstractTimeSteps,
      })
      .subscribe({
        next: (response) => {
          if (
            this.destroyed ||
            startGeneration !== this.sessionStartGeneration
          ) {
            if (response.runId !== this.runId) {
              this.stopDetachedSession(response.runId);
            }
            return;
          }
          if (!response.hasPlan || !response.solution?.facets.length) {
            this.stopDetachedSession(response.runId);
            this.sessionStatus = replacementRunId ? "ready" : "failed";
            this.backendError =
              "PlanPilot did not return a concrete plan for this configuration.";
            this.activeOperationLabel = "";
            return;
          }
          this.runId = response.runId;
          this.sessionStatus = "ready";
          this.sessionReused = Boolean(response.reused);
          this.activeSessionHorizon = response.configuration.horizon;
          this.activeSessionEncoding = response.configuration.encoding;
          this.activeSessionAbstractTimeSteps =
            response.configuration.abstractTimeSteps;
          this.sessionHorizon = response.configuration.horizon;
          this.sessionEncoding = response.configuration.encoding;
          this.sessionAbstractTimeSteps =
            response.configuration.abstractTimeSteps;
          this.selectionRevision = response.selectionRevision;
          this.undoStack = [];
          this.redoStack = [];
          this.pendingSelections = {};
          this.activePinnedFacets = {};
          this.knownFacets = {};
          this.inspectedFacetId = undefined;
          this.lastSelectionMessage = "";
          this.activeTimestep = null;
          this.focusedTimestep = null;
          this.applySessionSummary(response);
          this.activeOperationLabel = "";
          if (replacementRunId && replacementRunId !== response.runId) {
            this.stopDetachedSession(replacementRunId);
          }
          setTimeout(() => this.graph?.fitGraph());
        },
        error: (error) => {
          if (
            this.destroyed ||
            startGeneration !== this.sessionStartGeneration
          ) {
            return;
          }
          this.sessionStatus = replacementRunId ? "ready" : "failed";
          this.backendError = this.errorMessage(error);
          this.activeOperationLabel = "";
        },
      });
  }

  private clearSessionState(): void {
    this.invalidateAnalysisState();
    this.runId = undefined;
    this.sessionReused = false;
    this.sessionRevalidationFailed = false;
    this.facets = [];
    this.activePinnedFacets = {};
    this.knownFacets = {};
    this.pendingSelections = {};
    this.selectionRevision = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.representativeSolution = [];
    this.representativeSolutionLabel = "";
    this.currentSolutionNumber = 0;
    this.solutionCache = {};
    this.inspectedFacetId = undefined;
    this.activeFilter = "all";
    this.activeTimestep = null;
    this.focusedTimestep = null;
    this.query = "";
    this.facetListLimit = this.facetPageSize;
    this.graphFacetLimit = this.initialGraphFacetLimit;
    this.solutionCount = 0;
    this.solutionCountKnown = false;
    this.solutionCountLoading = false;
    this.solutionCountError = "";
    this.backendError = undefined;
    this.lastSpaceChangeSummary = "";
    this.activeOperationLabel = "";
    this.queryPending = false;
  }

  private isExpiredSessionError(error: unknown): boolean {
    const status = (error as { status?: unknown } | null)?.status;
    return status === 404 || status === 410;
  }

  loadSolutionCount(): void {
    if (
      !this.runId ||
      this.solutionCountLoading ||
      this.solutionCountKnown ||
      this.sessionConfigurationChanged ||
      this.pendingSelectionCount > 0
    ) {
      return;
    }

    const runId = this.runId;
    const revision = this.selectionRevision;
    this.solutionCountLoading = true;
    this.solutionCountError = "";
    this.activeOperationLabel = "Counting remaining plans";
    this.planPilotService.query$(runId, "solutionCount").subscribe({
      next: (response) => {
        if (this.runId !== runId) {
          return;
        }
        if (response.selectionRevision !== revision) {
          this.refreshAfterStaleQuery(runId);
          return;
        }
        const count = response.result.value;
        if (!Number.isInteger(count) || (count ?? 0) < 1) {
          this.solutionCountError =
            "PlanPilot did not return a valid plan count.";
        } else {
          this.applySolutionCount(count!);
        }
        this.solutionCountLoading = false;
        this.activeOperationLabel = "";
      },
      error: (error) => {
        if (this.runId !== runId) {
          return;
        }
        this.solutionCountError = this.isPlanSpaceTimeout(error)
          ? this.solutionCountTimeoutMessage()
          : `Plan count unavailable: ${this.errorMessage(error)}`;
        this.solutionCountLoading = false;
        this.activeOperationLabel = "";
      },
    });
  }

  private applySessionSummary(
    response: Pick<
      PlanPilotSessionResponse | PlanPilotFacetListResponse,
      "facets" | "solution" | "solutionCount"
    >,
  ): void {
    this.solutionCountLoading = false;
    this.planPreparationLoading = false;
    this.planPreparationError = "";
    this.applyOptionalSolutionCount(response.solutionCount);

    this.applyBackendFacets(response.facets);
    const solution = response.solution;
    this.representativeSolutionLabel = solution?.label ?? "";
    this.representativeSolution = this.toRepresentativeSolution(
      solution?.facets ?? [],
    );
    this.currentSolutionNumber = 0;
    this.solutionCache = {};
    this.loadedPlanNumbers = [];
  }

  private applySolutionCount(count: number): void {
    this.solutionCount = count;
    this.solutionCountKnown = true;
    this.solutionCountError = "";
    this.comparisonPlanA = Math.min(
      Math.max(1, this.comparisonPlanA),
      Math.max(1, count),
    );
    this.comparisonPlanB = Math.min(
      Math.max(1, this.comparisonPlanB),
      Math.max(1, count),
    );
    this.facets = this.facets.map((facet) =>
      facet.nodeType === "root" || facet.solutionContext
        ? { ...facet, remainingSolutions: count }
        : facet,
    );
    this.representativeSolution = this.representativeSolution.map((facet) => ({
      ...facet,
      remainingSolutions: count,
    }));
    this.solutionCache = Object.fromEntries(
      Object.entries(this.solutionCache).map(([number, solution]) => [
        Number(number),
        {
          ...solution,
          facets: solution.facets.map((facet) => ({
            ...facet,
            remainingSolutions: count,
          })),
        },
      ]),
    );
    this.facetImpacts = Object.fromEntries(
      Object.entries(this.facetImpacts).map(([id, impact]) => {
        const displayedFacet = this.representativeSolution.find(
          (facet) => facet.id === id,
        );
        return [
          id,
          displayedFacet && this.isFixedDisplayedPlanFacet(displayedFacet)
            ? this.fixedDisplayedPlanImpact(count)
            : impact,
        ];
      }),
    );
    if (
      this.inspectedFacetId &&
      this.facetImpacts[this.inspectedFacetId]?.exact
    ) {
      this.impactNotice = "";
    }
  }

  private applyOptionalSolutionCount(count: number | null): void {
    if (count === null) {
      this.solutionCount = 0;
      this.solutionCountKnown = false;
      this.solutionCountError = "";
      return;
    }
    this.applySolutionCount(count);
  }

  private isPlanSpaceTimeout(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("error" in error)) {
      return false;
    }
    return (
      (error as { error?: { code?: unknown } }).error?.code ===
      "PLAN_SPACE_TOO_LARGE"
    );
  }

  private solutionCountTimeoutMessage(): string {
    return "The exact total took too long to count. You can still browse plans.";
  }

  private refreshAfterStaleQuery(runId: string): void {
    if (this.runId !== runId) {
      return;
    }
    this.impactLoading = false;
    this.requiredActionsLoading = false;
    this.planPageLoading = false;
    this.planPreparationLoading = false;
    this.planPreparationError = "";
    this.comparisonLoading = false;
    this.solutionCountLoading = false;
    this.queryPending = false;
    this.activeOperationLabel = "";
    this.lastSelectionMessage =
      "The plan space changed in another window. Reloading it.";
    this.refreshFacets();
  }

  private applyBackendFacets(
    facets: PlanPilotFacet[],
    summarizeChange = false,
  ): void {
    this.invalidateAnalysisState();
    this.representativeSolution = [];
    this.representativeSolutionLabel = "";
    this.solutionCache = {};
    const previousAvailableIds = new Set(
      this.facets
        .filter((facet) => !this.isStructuralFacet(facet) && facet.available)
        .map((facet) => facet.id),
    );
    const mapped = facets
      .filter((facet) => !this.isStateFacet(facet))
      .map((facet, index) => this.toPlanPilotUiFacet(facet, index))
      .sort(
        (left, right) =>
          left.timestep - right.timestep ||
          left.label.localeCompare(right.label),
      );

    const pinned = Object.values(this.activePinnedFacets)
      .filter((facet) => !mapped.some((candidate) => candidate.id === facet.id))
      .map((facet) => ({
        ...facet,
        available: false,
        parentId: undefined,
      }));

    this.knownFacets = {
      ...this.knownFacets,
      ...Object.fromEntries(mapped.map((facet) => [facet.id, facet])),
      ...Object.fromEntries(pinned.map((facet) => [facet.id, facet])),
    };

    const navigableFacets = [...mapped, ...pinned].sort((left, right) =>
      this.compareGraphOrder(left, right),
    );

    if (summarizeChange && previousAvailableIds.size > 0) {
      const nextAvailableIds = new Set(mapped.map((facet) => facet.id));
      const added = mapped.filter(
        (facet) => !previousAvailableIds.has(facet.id),
      ).length;
      const removed = Array.from(previousAvailableIds).filter(
        (id) => !nextAvailableIds.has(id),
      ).length;
      this.lastSpaceChangeSummary = `${added} actions entered the current space · ${removed} left it`;
    }

    const root: PlanPilotUiFacet = {
      id: "__session__",
      label: "Start",
      detail: "Start of the displayed plan.",
      timestep: -1,
      action: "session",
      actionArguments: [],
      group: "Session",
      selection: "neutral",
      nodeType: "root",
      remainingSolutions: this.solutionCountKnown ? this.solutionCount : null,
      remainingFacets: mapped.length,
      solutionReduction: 0,
      facetReduction: 0,
      available: true,
      selectable: false,
      tokens: ["start", "plan-space", "session"],
    };

    const nextFacets = [root, ...navigableFacets];
    this.facets = nextFacets;
    if (!navigableFacets.length) {
      this.inspectedFacetId = undefined;
      this.lastSpaceChangeSummary = summarizeChange
        ? "Current space is empty for this selection."
        : this.lastSpaceChangeSummary;
    } else if (
      this.inspectedFacetId &&
      !nextFacets.some((facet) => facet.id === this.inspectedFacetId)
    ) {
      this.inspectedFacetId = undefined;
    }
  }

  private applySelectionSnapshot(
    response: PlanPilotSelectionMutationResponse,
    summarizeChange: boolean,
  ): void {
    this.selectionRevision = response.selectionRevision;
    this.applyOptionalSolutionCount(response.solutionCount);
    this.applyBackendFacets(response.facets, summarizeChange);
    this.representativeSolutionLabel = response.solution.label;
    this.representativeSolution = this.toRepresentativeSolution(
      response.solution.facets,
    );
    this.currentSolutionNumber = 0;
    this.solutionCache = {};
    this.loadedPlanNumbers = [];
    this.comparisonPlanA = 1;
    this.comparisonPlanB = this.solutionCountKnown
      ? Math.min(2, Math.max(1, this.solutionCount))
      : 2;
  }

  private updatePinnedFacet(
    facet: PlanPilotUiFacet,
    selection: FacetSelection,
  ): void {
    if (selection === "neutral") {
      const { [facet.id]: _, ...remaining } = this.activePinnedFacets;
      this.activePinnedFacets = remaining;
      return;
    }

    this.activePinnedFacets = {
      ...this.activePinnedFacets,
      [facet.id]: {
        ...this.withSelectionState(facet, selection),
        available: true,
      },
    };
  }

  private withSelectionState(
    facet: PlanPilotUiFacet,
    selection: FacetSelection,
  ): PlanPilotUiFacet {
    return withFacetSelectionState(facet, selection);
  }

  private toPlanPilotUiFacet(
    facet: PlanPilotFacet,
    index: number,
  ): PlanPilotUiFacet {
    return mapBackendFacet(facet, index);
  }

  private isStateFacet(facet: PlanPilotFacet): boolean {
    return facet.id.startsWith("holds(");
  }

  private isStructuralFacet(facet: PlanPilotUiFacet): boolean {
    return isStructuralPlanPilotFacet(facet);
  }

  private goalFacet(lastAction: PlanPilotUiFacet): PlanPilotUiFacet {
    return {
      id: "__goal__",
      label: "Goal reached",
      detail: "The displayed plan satisfies the planning goal.",
      timestep: lastAction.timestep + 1,
      action: "goal",
      actionArguments: [],
      group: "Goal",
      selection: "positive",
      remainingSolutions: this.solutionCountKnown ? this.solutionCount : null,
      remainingFacets: 0,
      solutionReduction: null,
      facetReduction: null,
      available: true,
      parentId: lastAction.id,
      nodeType: "goal",
      tokens: ["goal", "reached"],
      solutionContext: true,
    };
  }

  private isUserConstraint(facet: PlanPilotUiFacet): boolean {
    if (this.isStructuralFacet(facet)) {
      return false;
    }
    return (
      facet.selection !== "neutral" &&
      (facet.facetType === "selected" ||
        Boolean(this.activePinnedFacets[facet.id]))
    );
  }

  private compareGraphOrder(
    left: PlanPilotUiFacet,
    right: PlanPilotUiFacet,
  ): number {
    return (
      this.graphOrderWeight(left) - this.graphOrderWeight(right) ||
      left.timestep - right.timestep ||
      left.label.localeCompare(right.label)
    );
  }

  private graphOrderWeight(facet: PlanPilotUiFacet): number {
    if (facet.selection === "positive") {
      return 0;
    }
    if (facet.facetType === "implied") {
      return 1;
    }
    if (!facet.available) {
      return 4;
    }
    if (facet.selection === "negative") {
      return 3;
    }
    return 2;
  }

  private refreshFacets(): void {
    const runId = this.runId;
    if (!runId) {
      return;
    }

    this.queryPending = true;
    this.activeOperationLabel = "Refreshing plan space";
    this.planPilotService.listFacets$(runId).subscribe({
      next: (response) => {
        if (this.runId !== runId) {
          return;
        }
        this.backendError = undefined;
        this.selectionRevision = response.selectionRevision;
        this.applySessionSummary(response);
        this.queryPending = false;
        this.activeOperationLabel = "";
        setTimeout(() => this.graph?.fitGraph());
      },
      error: (error) => {
        if (this.runId !== runId) {
          return;
        }
        this.backendError = this.errorMessage(error);
        this.queryPending = false;
        this.activeOperationLabel = "";
      },
    });
  }

  private toRepresentativeSolution(
    facets: PlanPilotFacet[],
  ): PlanPilotUiFacet[] {
    return mapRepresentativeSolution(
      facets,
      this.solutionCountKnown ? this.solutionCount : null,
    );
  }

  private decorateGraphFacet(
    facet: PlanPilotUiFacet,
  ): PlanPilotDecoratedGraphFacet {
    const decorated = {
      ...facet,
      userConstraint:
        this.isRequiredFacet(facet) || this.isForbiddenFacet(facet),
      visualState: this.graphVisualState(facet),
    };
    return { ...decorated, meta: this.graphFacetMeta(decorated) };
  }

  private graphVisualState(facet: PlanPilotUiFacet): PlanPilotGraphVisualState {
    if (facet.nodeType === "root") {
      return "root";
    }
    if (facet.nodeType === "goal") {
      return "goal";
    }
    if (facet.nodeType === "time") {
      return "time";
    }
    if (this.isDisplayedPlanFacet(facet)) {
      return "displayed-plan";
    }
    if (facet.facetType === "implied") {
      return "implied";
    }
    if (facet.facetType === "empty") {
      return "empty";
    }
    if (this.isForbiddenFacet(facet)) {
      return "forbidden";
    }
    if (this.isRequiredFacet(facet)) {
      return "required";
    }
    if (!facet.available) {
      return facet.nodeType === "query" ? "query" : "unavailable";
    }
    return facet.nodeType === "query" ? "query" : "alternative";
  }

  private isBackendFacet(facet: PlanPilotUiFacet): boolean {
    return this.facets.some((candidate) => candidate.id === facet.id);
  }

  private isFixedDisplayedPlanFacet(facet: PlanPilotUiFacet): boolean {
    const backendFacet = this.facets.find(
      (candidate) => candidate.id === facet.id,
    );
    return (
      this.isDisplayedPlanFacet(facet) &&
      (!backendFacet || backendFacet.selectable === false)
    );
  }

  private fixedDisplayedPlanImpact(count: number | null): PlanPilotFacetImpact {
    return {
      exact: count !== null,
      comparableToCurrent: true,
      require: {
        available: true,
        planReduction: count === null ? null : 0,
        plansRemaining: count,
        facetReduction: null,
        facetsRemaining: null,
      },
      forbid: {
        available: false,
        planReduction: count === null ? null : 1,
        plansRemaining: count === null ? null : 0,
        facetReduction: null,
        facetsRemaining: null,
      },
    };
  }

  private canPreviewFacetImpact(facet: PlanPilotUiFacet): boolean {
    return (
      this.isFixedDisplayedPlanFacet(facet) ||
      this.canRequireFacet(facet) ||
      this.canForbidFacet(facet)
    );
  }

  private restoreDocumentScroll(): void {
    this.document.body.classList.remove(this.fullscreenBodyClass);
    if (!this.fullscreenScrollLocked) {
      return;
    }
    this.document.body.style.overflow = this.bodyOverflowBeforeFullscreen;
    this.fullscreenScrollLocked = false;
  }

  private stopDetachedSession(runId: string): void {
    this.planPilotService
      .stopSession$(runId)
      .pipe(take(1))
      .subscribe({ error: () => undefined });
  }

  private graphFacetMeta(facet: PlanPilotUiFacet): string {
    const pending = this.pendingSelections[facet.id]?.selection;
    if (facet.nodeType === "root") {
      return this.solutionCountKnown
        ? `${this.solutionCount} valid plan${this.solutionCount === 1 ? "" : "s"}`
        : "valid plan count pending";
    }
    if (facet.nodeType === "goal") {
      return "goal reached";
    }
    if (facet.facetType === "empty") {
      return `unused bounded step · t${facet.timestep}`;
    }
    const timestep = facet.abstractTimeStep ? "any step" : `t${facet.timestep}`;
    if (facet.selection === "negative") {
      return `${pending === "negative" ? "forbid pending" : "forbidden by you"} · ${timestep}`;
    }
    if (facet.solutionContext && facet.facetType === "implied") {
      return `in every plan · ${timestep}`;
    }
    if (facet.facetType === "implied") {
      return `in every plan · ${timestep}`;
    }
    if (facet.solutionContext) {
      const constraintText =
        pending === "positive"
          ? " · require pending"
          : pending === "negative"
            ? " · forbid pending"
            : this.isUserConstraint(facet) && facet.selection === "positive"
              ? " · required by you"
              : "";
      return `displayed plan${constraintText} · ${timestep}`;
    }
    if (this.isRequiredFacet(facet)) {
      return `${pending === "positive" ? "require pending" : "required by you"} · ${timestep}`;
    }
    if (!facet.available) {
      return `active constraint · ${timestep}`;
    }
    return `available · ${timestep}`;
  }

  private graphDiagnosticFilename(generatedAt: string): string {
    const projectName =
      (this.sessionProject?.name ?? "project")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "project";
    const timestamp = generatedAt.replace(/[:.]/g, "-");
    return `planpilot-${projectName}-${timestamp}.json`;
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === "object" && "error" in error) {
      const body = (error as { error?: { code?: string; message?: string } })
        .error;
      if (body?.code === "PLAN_SPACE_TOO_LARGE") {
        return "PlanPilot did not finish in time. Try a smaller horizon or exact mode.";
      }
      if (body?.message) {
        return body.message;
      }
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
    return "PlanPilot backend request failed.";
  }

  private isSelectionConflict(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("error" in error)) {
      return false;
    }
    return (
      (error as { error?: { code?: unknown } }).error?.code ===
      "SELECTION_CONFLICT"
    );
  }
}
