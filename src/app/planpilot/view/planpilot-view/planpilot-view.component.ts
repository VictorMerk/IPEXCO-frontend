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
} from "../../components/planpilot-graph/planpilot-graph.component";
import {
  PlanPilotSelectedActionView,
  PlanPilotSidebarActionsComponent,
} from "../../components/planpilot-sidebar-actions/planpilot-sidebar-actions.component";
import { PlanPilotSidebarPlanComponent } from "../../components/planpilot-sidebar-plan/planpilot-sidebar-plan.component";
import { PlanPilotSidebarPlansComponent } from "../../components/planpilot-sidebar-plans/planpilot-sidebar-plans.component";
import {
  PlanPilotCapabilities,
  PlanPilotFacet,
  PlanPilotFacetListResponse,
  PlanPilotQueryJob,
  PlanPilotQueryResult,
  PlanPilotSelectionMutationResponse,
  PlanPilotSessionResponse,
  PlanPilotService,
} from "../../service/planpilot.service";
import {
  hasPlanPilotErrorCode,
  planPilotError,
} from "../../service/planpilot-error";
import { PlanPilotQueryJobsService } from "../../service/planpilot-query-jobs.service";
import { buildPlanPilotViewGraphConnections } from "./planpilot-graph-connections";
import {
  buildGoalFacet,
  decorateGraphFacet,
  facetStateLabel as presentFacetStateLabel,
  isDisplayedPlanFacet as facetIsInDisplayedPlan,
  isForbiddenFacet as facetIsForbidden,
  isRequiredFacet as facetIsRequired,
  isUserConstraint as facetIsUserConstraint,
  PlanPilotDecoratedGraphFacet,
  PlanPilotFacetPresentationContext,
  selectionLabel as presentSelectionLabel,
} from "./planpilot-facet-presentation";
import { buildFacetSnapshot } from "./planpilot-facet-store";
import { buildPlanPilotGraphView } from "./planpilot-graph-view";
import { planPilotFacetAvailabilityReason } from "./planpilot-facet-availability";
import {
  buildPlanPilotGraphDiagnostic,
  javascriptAssetNames,
  PlanPilotGraphDiagnostic,
} from "./planpilot-graph-diagnostic";
import {
  buildActionImpactView,
  buildPlanComparisonGraphStates,
  buildTimelineRows,
  comparePlanSolutions,
  fixedDisplayedPlanImpact,
  parseSelectionImpact,
  PlanPilotComparison,
  PlanPilotFacetImpact,
  PlanPilotPlanSummary,
  PlanPilotTimelineRow,
} from "./planpilot-analysis";
import {
  buildPlanPage,
  cachedPlanNumbers,
  knownPlanLowerBound,
  mergePlanLoadResults,
  nextPlanBatch,
  planPageStartFor,
  planPageSummaries,
  PlanPilotPlanLoadResult as PlanLoadResult,
  PlanPilotSolutionCache,
} from "./planpilot-plan-store";
import {
  mapBackendFacet,
  mapRepresentativeSolution,
  withFacetSelectionState,
} from "./planpilot-solution";
import {
  buildConstraintTransaction,
  discardSelectionDraft,
  stageFacetSelection,
} from "./planpilot-selection-draft";
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
  PlanPilotConstraintTransaction,
  PlanPilotUiFacet,
} from "./planpilot-view.models";

type PlanPilotSidebarSection = "timeline" | "browse" | "plans";
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
  private readonly planBatchSize = 20;
  private readonly maxFacetChangesPerRequest = 50;
  private readonly maxHistoryEntries = 50;
  maxSessionHorizon = 100;
  analysisTimeoutSeconds = 30;
  maxAnalysisTimeoutSeconds = 300;
  private readonly fullscreenBodyClass = "planpilot-fullscreen-open";
  private route = inject(ActivatedRoute);
  private planPilotService = inject(PlanPilotService);
  private queryJobs = inject(PlanPilotQueryJobsService);
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
  solutionCache: PlanPilotSolutionCache = {};
  facetListLimit = this.facetPageSize;
  graphFacetLimit = this.initialGraphFacetLimit;
  activeTimestep: number | "any" | null = null;
  focusedTimestep: number | "any" | null = null;
  hoveredTimestep: number | "any" | null = null;
  hoveredFacetId?: string;
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
  comparisonGraphActive = false;
  comparisonGraphStates: Record<
    string,
    "same" | "moved" | "only-a" | "only-b"
  > = {};
  comparisonGraphPlans?: {
    a: PlanPilotUiFacet[];
    b: PlanPilotUiFacet[];
  };
  selectionRevision = 0;
  capabilities?: PlanPilotCapabilities;
  activeQueryJob?: PlanPilotQueryJob;

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
    const presentation = this.facetPresentationContext();
    const goalFacet = this.representativeSolution.length
      ? buildGoalFacet(
          this.representativeSolution[this.representativeSolution.length - 1],
          presentation.solutionCount,
        )
      : undefined;
    return buildPlanPilotGraphView({
      facets: this.facets,
      displayedPlan: this.representativeSolution,
      goal: goalFacet,
      inspectedFacetId: this.inspectedFacetId,
      limit: this.graphFacetLimit,
      comparisonActive: this.comparisonGraphActive,
      comparisonStates: this.comparisonGraphStates,
      comparisonPlans: this.comparisonGraphPlans,
      compare: (left, right) => this.compareFacets(left, right),
    }).map((facet) => decorateGraphFacet(facet, presentation));
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
    return knownPlanLowerBound(
      this.solutionCache,
      this.currentSolutionNumber,
      this.representativeSolution.length > 0,
    );
  }

  get loadedPlanCount(): number {
    return Object.keys(this.solutionCache).length;
  }

  get cachedPlanNumbers(): number[] {
    return cachedPlanNumbers(this.solutionCache);
  }

  get nextPlanBatchStart(): number {
    return this.planBatchRange.start;
  }

  get nextPlanBatchEnd(): number {
    return this.planBatchRange.end;
  }

  get hasMorePlanBatches(): boolean {
    return this.planBatchRange.hasMore;
  }

  private get planBatchRange() {
    return nextPlanBatch(
      this.solutionCache,
      this.planBatchSize,
      this.solutionCountKnown,
      this.solutionCount,
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
    return planPageSummaries(this.solutionCache, this.loadedPlanNumbers);
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
    this.project$.pipe(take(1)).subscribe((project) => {
      this.loadCapabilities(project);
      this.startSession(project);
    });
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
      return;
    }
    this.clearInspectedFacet();
    this.hoverFacet();
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
  }

  hoverFacet(facetId?: string): void {
    this.hoveredFacetId = facetId;
  }

  hoverTimestep(timestep: number | "any" | null): void {
    this.hoveredTimestep = timestep;
  }

  get highlightedGraphTimestep(): number | "any" | null {
    return this.hoveredTimestep ?? this.focusedTimestep;
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

  updateAnalysisTimeout(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value)) {
      this.analysisTimeoutSeconds = Math.min(
        this.maxAnalysisTimeoutSeconds,
        Math.max(5, value),
      );
    }
  }

  get supportsAsyncJobs(): boolean {
    return this.capabilities?.supportsAsyncJobs === true;
  }

  get supportsAsyncPlanPreparation(): boolean {
    return (
      this.supportsAsyncJobs &&
      this.capabilities?.asyncJobTypes?.includes("solution") === true
    );
  }

  get canCancelActiveQueryJob(): boolean {
    return (
      this.activeQueryJob?.status === "queued" ||
      this.activeQueryJob?.status === "running"
    );
  }

  cancelActiveQueryJob(): void {
    const runId = this.runId;
    const job = this.activeQueryJob;
    if (
      !runId ||
      !job ||
      ["succeeded", "failed", "cancelled"].includes(job.status)
    ) {
      return;
    }
    this.activeOperationLabel = "Cancelling PlanPilot operation";
    this.queryJobs
      .cancel$(runId, job.jobId)
      .pipe(take(1))
      .subscribe({
        next: (cancelled) => {
          if (this.runId !== runId) {
            return;
          }
          this.activeQueryJob = cancelled;
          this.finishCancelledQueryJob();
        },
        error: (error) => {
          if (this.runId !== runId) {
            return;
          }
          this.backendError = this.errorMessage(error);
          this.finishCancelledQueryJob();
        },
      });
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
      unavailableReason: this.facetAvailabilityReason(facet),
      requireImpact: impact
        ? buildActionImpactView(
            impact.require,
            impact.forbid,
            impact.comparableToCurrent,
            this.solutionCountKnown ? this.solutionCount : null,
          )
        : undefined,
      forbidImpact: impact
        ? buildActionImpactView(
            impact.forbid,
            impact.require,
            impact.comparableToCurrent,
            this.solutionCountKnown ? this.solutionCount : null,
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
        [facet.id]: fixedDisplayedPlanImpact(count),
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
    if (this.supportsAsyncJobs) {
      this.queryJobs
        .run$(runId, {
          type: "selectionImpact",
          facetId: facet.id,
          expectedSelectionRevision: revision,
          timeoutSeconds: this.analysisTimeoutSeconds,
        })
        .subscribe({
          next: (job) => {
            if (
              this.runId !== runId ||
              this.analysisGeneration !== generation
            ) {
              return;
            }
            this.activeQueryJob = job;
            if (job.status === "queued" || job.status === "running") {
              return;
            }
            if (job.selectionRevision !== revision) {
              this.activeQueryJob = undefined;
              this.refreshAfterStaleQuery(runId);
              return;
            }
            if (job.status === "cancelled") {
              this.finishCancelledQueryJob();
              return;
            }
            if (job.status === "failed") {
              this.impactError =
                job.error?.message ?? "Action impact is unavailable.";
              this.impactLoading = false;
              this.activeOperationLabel = "";
              this.activeQueryJob = undefined;
              return;
            }
            this.applyImpactQueryResult(facet, job.result);
            this.activeQueryJob = undefined;
          },
          error: (error) => this.handleImpactError(runId, generation, error),
        });
      return;
    }
    this.planPilotService
      .selectionImpact$(runId, facet.id, this.analysisTimeoutSeconds)
      .subscribe({
        next: (response) => {
          if (this.runId !== runId || this.analysisGeneration !== generation) {
            return;
          }
          if (response.selectionRevision !== revision) {
            this.refreshAfterStaleQuery(runId);
            return;
          }
          this.applyImpactQueryResult(facet, response.result);
        },
        error: (error) => this.handleImpactError(runId, generation, error),
      });
  }

  private applyImpactQueryResult(
    facet: PlanPilotUiFacet,
    result: PlanPilotQueryResult | undefined,
  ): void {
    const parsed = parseSelectionImpact(result, facet.id);
    if (!parsed) {
      this.impactError = "PlanPilot returned an invalid impact result.";
      this.impactLoading = false;
      this.activeOperationLabel = "";
      return;
    }
    if (parsed.totalPlans !== null) {
      this.applySolutionCount(parsed.totalPlans);
    }
    this.facetImpacts = { [facet.id]: parsed.impact };
    this.impactNotice = parsed.impact.exact
      ? ""
      : "Exact counts took too long. Availability is shown instead.";
    this.impactLoading = false;
    this.activeOperationLabel = "";
    this.lastSelectionMessage =
      "Action impact calculated for the current plan space.";
  }

  private handleImpactError(
    runId: string,
    generation: number,
    error: unknown,
  ): void {
    if (this.runId !== runId || this.analysisGeneration !== generation) {
      return;
    }
    this.impactError = this.errorMessage(error);
    this.impactNotice = "";
    this.impactLoading = false;
    this.activeOperationLabel = "";
    this.activeQueryJob = undefined;
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
    const page = buildPlanPage(
      start,
      this.planPageSize,
      this.solutionCountKnown,
      this.solutionCount,
    );
    const normalizedStart = page.start;
    const numbers = page.numbers;
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
        const merged = mergePlanLoadResults(
          this.solutionCache,
          results,
          (error) => this.errorMessage(error),
        );
        this.solutionCache = merged.cache;
        this.planPageStart = normalizedStart;
        this.loadedPlanNumbers = numbers.filter((number) =>
          Boolean(this.solutionCache[number]),
        );
        this.planPageError = merged.errors.join(" ");
        this.planPageLoading = false;
        this.activeOperationLabel = "";
        if (
          this.solutionCountKnown &&
          (normalizedStart > this.solutionCount ||
            (solutionToShow !== undefined &&
              solutionToShow > this.solutionCount))
        ) {
          this.lastSelectionMessage = `This plan space contains ${this.solutionCount} plan${this.solutionCount === 1 ? "" : "s"}. Showing the last page.`;
          const finalPageStart = planPageStartFor(
            this.solutionCount,
            this.planPageSize,
          );
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
    this.loadPlanPage(
      planPageStartFor(solutionNumber, this.planPageSize),
      solutionNumber,
    );
  }

  loadNextPlanBatch(): void {
    const batchStart = this.nextPlanBatchStart;
    const batchEnd = this.nextPlanBatchEnd;
    if (
      !this.runId ||
      this.isBusy ||
      this.sessionConfigurationChanged ||
      this.pendingSelectionCount > 0 ||
      !this.hasMorePlanBatches ||
      batchEnd < batchStart
    ) {
      return;
    }

    const runId = this.runId;
    const generation = this.analysisGeneration;
    this.planPreparationLoading = true;
    this.planPreparationError = "";
    this.activeOperationLabel = `Loading plans ${batchStart}–${batchEnd}`;
    if (this.supportsAsyncPlanPreparation) {
      const revision = this.selectionRevision;
      this.queryJobs
        .run$(runId, {
          type: "solution",
          solutionStart: batchStart,
          solutionNumber: batchEnd,
          expectedSelectionRevision: revision,
          timeoutSeconds: this.analysisTimeoutSeconds,
        })
        .subscribe({
          next: (job) => {
            if (
              this.runId !== runId ||
              this.analysisGeneration !== generation
            ) {
              return;
            }
            this.activeQueryJob = job;
            if (job.status === "queued" || job.status === "running") {
              return;
            }
            if (job.selectionRevision !== revision) {
              this.activeQueryJob = undefined;
              this.refreshAfterStaleQuery(runId);
              return;
            }
            if (job.status === "cancelled") {
              this.finishCancelledQueryJob();
              return;
            }
            if (job.status === "failed") {
              this.planPreparationError =
                job.error?.message ?? "Plans could not be loaded.";
              this.planPreparationLoading = false;
              this.activeOperationLabel = "";
              this.activeQueryJob = undefined;
              return;
            }
            const results: PlanLoadResult[] = (job.result?.solutions ?? []).map(
              (solution, index) => ({
                number: batchStart + index,
                plan: {
                  number: batchStart + index,
                  label: solution.label,
                  facets: this.toRepresentativeSolution(solution.facets),
                },
              }),
            );
            this.finishPlanBatch(
              runId,
              generation,
              batchStart,
              batchEnd,
              results,
            );
            this.activeQueryJob = undefined;
          },
          error: (error) => {
            if (
              this.runId !== runId ||
              this.analysisGeneration !== generation
            ) {
              return;
            }
            this.planPreparationError = this.errorMessage(error);
            this.planPreparationLoading = false;
            this.activeOperationLabel = "";
            this.activeQueryJob = undefined;
          },
        });
      return;
    }
    const numbers = Array.from(
      { length: batchEnd - batchStart + 1 },
      (_, index) => batchStart + index,
    );
    this.loadPlanResultsHighestFirst$(runId, numbers).subscribe({
      next: (results) =>
        this.finishPlanBatch(runId, generation, batchStart, batchEnd, results),
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

  private finishPlanBatch(
    runId: string,
    generation: number,
    batchStart: number,
    batchEnd: number,
    results: PlanLoadResult[],
  ): void {
    if (this.runId !== runId || this.analysisGeneration !== generation) {
      return;
    }
    if (results.some((result) => result.stale)) {
      this.refreshAfterStaleQuery(runId);
      return;
    }
    const merged = mergePlanLoadResults(this.solutionCache, results, (error) =>
      this.errorMessage(error),
    );
    this.solutionCache = merged.cache;
    const errors = merged.errors;
    const loadedNumbers = Array.from(
      { length: batchEnd - batchStart + 1 },
      (_, index) => batchStart + index,
    ).filter((number) => Boolean(this.solutionCache[number]));
    if (
      !this.solutionCountKnown &&
      loadedNumbers.length < batchEnd - batchStart + 1 &&
      errors.length === 0
    ) {
      this.applySolutionCount(
        loadedNumbers.length
          ? loadedNumbers[loadedNumbers.length - 1]
          : Math.max(0, batchStart - 1),
      );
    }
    if (loadedNumbers.length) {
      this.planPageStart = planPageStartFor(
        loadedNumbers[0],
        this.planPageSize,
      );
      this.loadedPlanNumbers = loadedNumbers.slice(0, this.planPageSize);
      const lastLoaded = loadedNumbers[loadedNumbers.length - 1];
      this.lastSelectionMessage = `Loaded plans ${loadedNumbers[0]}–${lastLoaded}.`;
    } else if (!errors.length) {
      this.lastSelectionMessage = "No more plans are available.";
    }
    this.planPreparationError = errors.join(" ");
    this.planPreparationLoading = false;
    this.activeOperationLabel = "";
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
    this.clearGraphComparison();
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
        this.solutionCache = mergePlanLoadResults(
          this.solutionCache,
          [resultA, resultB],
          (error) => this.errorMessage(error),
        ).cache;
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
          this.comparisonGraphPlans = {
            a: cachedA.facets.map((facet) => ({ ...facet })),
            b: cachedB.facets.map((facet) => ({ ...facet })),
          };
          this.comparisonGraphStates = buildPlanComparisonGraphStates(
            cachedA.facets,
            cachedB.facets,
          );
          this.comparisonGraphActive = true;
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

  clearGraphComparison(): void {
    this.comparisonGraphActive = false;
    this.comparisonGraphStates = {};
    this.comparisonGraphPlans = undefined;
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
    this.planPilotService
      .query$(runId, "solution", solutionNumber, this.analysisTimeoutSeconds)
      .subscribe({
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
              facets: this.representativeSolution.map((facet) => ({
                ...facet,
              })),
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

    const targetSelection = selection;
    const draft = stageFacetSelection(
      this.facets,
      this.pendingSelections,
      facetId,
      targetSelection,
      new Set(this.activeConstraints.map((constraint) => constraint.id)),
    );
    this.pendingSelections = draft.pendingSelections;
    this.facets = draft.facets;
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
    const transaction = buildConstraintTransaction(stagedSelections);

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
            this.facets = discardSelectionDraft(
              this.facets,
              this.pendingSelections,
            );
            this.pendingSelections = {};
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

    this.facets = discardSelectionDraft(this.facets, this.pendingSelections);
    this.pendingSelections = {};
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
    return presentSelectionLabel(selection);
  }

  timestepLabel(facet: PlanPilotUiFacet): string {
    return facet.abstractTimeStep ? "Any step" : `t${facet.timestep}`;
  }

  facetStateLabel(facet: PlanPilotUiFacet): string {
    return presentFacetStateLabel(facet, this.facetPresentationContext());
  }

  isDisplayedPlanFacet(facet: PlanPilotUiFacet): boolean {
    return facetIsInDisplayedPlan(facet, this.facetPresentationContext());
  }

  isRequiredFacet(facet: PlanPilotUiFacet): boolean {
    return facetIsRequired(facet, this.facetPresentationContext());
  }

  isForbiddenFacet(facet: PlanPilotUiFacet): boolean {
    return facetIsForbidden(facet, this.facetPresentationContext());
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
    return {
      ...buildActionRowView(facet, {
        timestepLabel: (item) => this.timestepLabel(item),
        stateLabel: (item) => this.facetStateLabel(item),
        displayedPlan: (item) => this.isDisplayedPlanFacet(item),
        required: (item) => this.isRequiredFacet(item),
        forbidden: (item) => this.isForbiddenFacet(item),
        selectedFacetId: this.inspectedFacetId,
      }),
      unavailableReason: this.facetAvailabilityReason(facet),
    };
  }

  private facetAvailabilityReason(facet: PlanPilotUiFacet): string | undefined {
    return planPilotFacetAvailabilityReason(
      facet,
      this.activeConstraints,
      this.knownFacets,
    );
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
    return this.planPilotService
      .query$(runId, "solution", number, this.analysisTimeoutSeconds)
      .pipe(
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
    this.clearGraphComparison();
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
    return (
      status === 404 ||
      status === 410 ||
      hasPlanPilotErrorCode(
        error,
        "PLANPILOT_RUN_EXPIRED",
        "PLANPILOT_RUN_NOT_FOUND",
        "SESSION_EXPIRED",
        "SESSION_NOT_FOUND",
      )
    );
  }

  private loadCapabilities(project: Project): void {
    this.planPilotService
      .getCapabilities$(project._id)
      .pipe(take(1))
      .subscribe({
        next: (capabilities) => {
          this.capabilities = capabilities;
          this.maxSessionHorizon = capabilities.maxHorizon;
          this.maxAnalysisTimeoutSeconds =
            capabilities.maxQueryTimeoutSeconds ?? 300;
          this.analysisTimeoutSeconds = Math.min(
            this.maxAnalysisTimeoutSeconds,
            capabilities.defaultQueryTimeoutSeconds ??
              this.analysisTimeoutSeconds,
          );
          this.sessionHorizon = Math.min(
            Math.max(1, this.sessionHorizon),
            capabilities.maxHorizon,
          );
        },
        error: () => undefined,
      });
  }

  private finishCancelledQueryJob(): void {
    const wasLoadingPlans = this.planPreparationLoading;
    const hadActiveOperation =
      this.solutionCountLoading ||
      this.impactLoading ||
      this.planPreparationLoading;
    if (!hadActiveOperation) {
      this.activeQueryJob = undefined;
      return;
    }
    this.solutionCountLoading = false;
    this.impactLoading = false;
    this.planPreparationLoading = false;
    this.activeOperationLabel = "";
    this.lastSelectionMessage = wasLoadingPlans
      ? "Plan loading cancelled. Plans that were already loaded remain available."
      : "Operation cancelled.";
    this.activeQueryJob = undefined;
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
    if (this.supportsAsyncJobs) {
      this.queryJobs
        .run$(runId, {
          type: "solutionCount",
          expectedSelectionRevision: revision,
          timeoutSeconds: this.analysisTimeoutSeconds,
        })
        .subscribe({
          next: (job) => {
            if (this.runId !== runId) {
              return;
            }
            this.activeQueryJob = job;
            if (job.status === "queued" || job.status === "running") {
              return;
            }
            if (job.selectionRevision !== revision) {
              this.activeQueryJob = undefined;
              this.refreshAfterStaleQuery(runId);
              return;
            }
            if (job.status === "cancelled") {
              this.finishCancelledQueryJob();
              return;
            }
            if (job.status === "failed") {
              this.solutionCountError = this.isPlanSpaceTimeout(job.error)
                ? this.solutionCountTimeoutMessage()
                : (job.error?.message ?? "Plan count unavailable.");
              this.solutionCountLoading = false;
              this.activeOperationLabel = "";
              this.activeQueryJob = undefined;
              return;
            }
            this.applyCountResult(job.result?.value);
            this.solutionCountLoading = false;
            this.activeOperationLabel = "";
            this.activeQueryJob = undefined;
          },
          error: (error) => this.handleSolutionCountError(runId, error),
        });
      return;
    }
    this.planPilotService
      .query$(runId, "solutionCount", undefined, this.analysisTimeoutSeconds)
      .subscribe({
        next: (response) => {
          if (this.runId !== runId) {
            return;
          }
          if (response.selectionRevision !== revision) {
            this.refreshAfterStaleQuery(runId);
            return;
          }
          this.applyCountResult(response.result.value);
          this.solutionCountLoading = false;
          this.activeOperationLabel = "";
        },
        error: (error) => this.handleSolutionCountError(runId, error),
      });
  }

  private applyCountResult(count: number | undefined): void {
    if (!Number.isInteger(count) || (count ?? 0) < 1) {
      this.solutionCountError = "PlanPilot did not return a valid plan count.";
      return;
    }
    this.applySolutionCount(count!);
  }

  private handleSolutionCountError(runId: string, error: unknown): void {
    if (this.runId !== runId) {
      return;
    }
    this.solutionCountError = this.isPlanSpaceTimeout(error)
      ? this.solutionCountTimeoutMessage()
      : `Plan count unavailable: ${this.errorMessage(error)}`;
    this.solutionCountLoading = false;
    this.activeOperationLabel = "";
    this.activeQueryJob = undefined;
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
            ? fixedDisplayedPlanImpact(count)
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
    return hasPlanPilotErrorCode(
      error,
      "PLAN_SPACE_TOO_LARGE",
      "PLANPILOT_TIMEOUT",
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
    const snapshot = buildFacetSnapshot({
      backendFacets: facets,
      previousFacets: this.facets,
      activePinnedFacets: this.activePinnedFacets,
      knownFacets: this.knownFacets,
      remainingSolutions: this.solutionCountKnown ? this.solutionCount : null,
      inspectedFacetId: this.inspectedFacetId,
      summarizeChange,
    });
    this.facets = snapshot.facets;
    this.knownFacets = snapshot.knownFacets;
    this.inspectedFacetId = snapshot.inspectedFacetId;
    if (snapshot.spaceChangeSummary !== undefined) {
      this.lastSpaceChangeSummary = snapshot.spaceChangeSummary;
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

  private isUserConstraint(facet: PlanPilotUiFacet): boolean {
    return facetIsUserConstraint(facet, this.facetPresentationContext());
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

  private facetPresentationContext(): PlanPilotFacetPresentationContext {
    return {
      displayedPlanIds: new Set(
        this.representativeSolution.map((facet) => facet.id),
      ),
      activePinnedFacetIds: new Set(Object.keys(this.activePinnedFacets)),
      pendingSelections: this.pendingSelections,
      solutionCount: this.solutionCountKnown ? this.solutionCount : null,
      comparisonActive: this.comparisonGraphActive,
      comparisonStates: this.comparisonGraphStates,
    };
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
    return planPilotError(error).message;
  }

  private isSelectionConflict(error: unknown): boolean {
    return hasPlanPilotErrorCode(error, "SELECTION_CONFLICT");
  }
}
