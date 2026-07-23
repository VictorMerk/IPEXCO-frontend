import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import cytoscape, { Core, EdgeSingular, ElementDefinition, EventObject, NodeSingular } from 'cytoscape';
import { PLANPILOT_GRAPH_STYLES } from './planpilot-graph.styles';

export type PlanPilotGraphFacetSelection = 'positive' | 'negative' | 'neutral';
export type PlanPilotGraphVisualState =
  | 'root'
  | 'goal'
  | 'time'
  | 'displayed-plan'
  | 'required'
  | 'forbidden'
  | 'alternative'
  | 'implied'
  | 'empty'
  | 'unavailable'
  | 'query';

export interface PlanPilotGraphFacet {
  id: string;
  label: string;
  timestep: number;
  action: string;
  group: string;
  selection: PlanPilotGraphFacetSelection;
  remainingSolutions: number | null;
  available?: boolean;
  nodeType?: 'root' | 'goal' | 'time' | 'plan' | 'path' | 'candidate' | 'excluded' | 'query';
  meta?: string;
  solutionContext?: boolean;
  userConstraint?: boolean;
  abstractTimeStep?: boolean;
  visualState: PlanPilotGraphVisualState;
}

export interface PlanPilotGraphConnection {
  sourceId: string;
  targetId: string;
  kind: 'plan';
  gapTimesteps?: number[];
  label?: string;
}

export interface PlanPilotGraphTap {
  facetId?: string;
  x: number;
  y: number;
}

export interface PlanPilotGraphSnapshot {
  viewport: {
    width: number;
    height: number;
    zoom: number;
    pan: { x: number; y: number };
    visibleFacetIds: string[];
  };
  imagePngDataUrl: string;
  nodes: {
    id: string;
    label: string;
    classes: string[];
    position: { x: number; y: number };
    renderedPosition: { x: number; y: number };
    renderedSize: { width: number; height: number };
    insideViewport: boolean;
    computedStyle: {
      backgroundColor: string;
      borderColor: string;
      borderStyle: string;
      borderWidth: number;
      shape: string;
      opacity: number;
    };
  }[];
  edges: {
    id: string;
    sourceId: string;
    targetId: string;
    label: string;
    gapTimesteps: number[];
    classes: string[];
    width: number;
    renderedWidth: number;
    sourceArrowShape: string;
    targetArrowShape: string;
    renderedSourceEndpoint: { x: number; y: number };
    renderedTargetEndpoint: { x: number; y: number };
  }[];
}

@Component({
  selector: 'app-planpilot-graph',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './planpilot-graph.component.html',
  styleUrl: './planpilot-graph.component.scss',
})
export class PlanPilotGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() facets: PlanPilotGraphFacet[] = [];
  @Input() connections: PlanPilotGraphConnection[] = [];
  @Input() selectedFacetId?: string;
  @Input() horizon = 0;
  @Output() facetSelected = new EventEmitter<PlanPilotGraphTap>();

  @ViewChild('graphContainer', { static: true }) graphContainer!: ElementRef<HTMLDivElement>;

  private graph?: Core;
  private resizeObserver?: ResizeObserver;
  private lastStructureSignature = '';
  private readonly basePlanEdgeWidth = 8;
  private readonly minimumRenderedPlanEdgeWidth = 2;

  ngAfterViewInit(): void {
    this.graph = cytoscape({
      container: this.graphContainer.nativeElement,
      elements: this.toElements(),
      minZoom: 0.08,
      maxZoom: 4,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      style: PLANPILOT_GRAPH_STYLES,
      autoungrabify: false,
      boxSelectionEnabled: false,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      layout: this.treeLayout(),
    });

    this.graph.on('tap', 'node.facet', (event: EventObject) => {
      const facetId = event.target.id();
      this.facetSelected.emit({ ...this.tapPosition(event), facetId });
    });
    this.graph.on('zoom', () => this.updatePlanEdgeWidth());

    this.applySelection();
    this.updatePlanEdgeWidth();
    this.lastStructureSignature = this.structureSignature();
    this.resizeObserver = new ResizeObserver(() => this.resizeGraph());
    this.resizeObserver.observe(this.graphContainer.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.graph) {
      return;
    }

    if (changes['facets'] || changes['connections']) {
      const nextSignature = this.structureSignature();
      if (nextSignature !== this.lastStructureSignature) {
        this.rebuildGraph();
        this.lastStructureSignature = nextSignature;
      } else {
        this.applyNodeClasses();
        this.applyEdgeClasses();
      }
    }

    this.applySelection();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.graph?.destroy();
  }

  fitGraph(): void {
    this.resizeGraph();
    if (!this.graph) {
      return;
    }

    const planNodes = this.graph.nodes('.displayed-plan');
    const root = this.graph.nodes('.root');
    const goal = this.graph.nodes('.goal');
    const displayedPlan = root.union(planNodes).union(goal);
    this.graph.fit(displayedPlan.nonempty() ? displayedPlan : this.graph.elements(), 56);
    this.updatePlanEdgeWidth();
  }

  fitAllGraph(): void {
    this.resizeGraph();
    this.graph?.fit(undefined, 48);
    this.updatePlanEdgeWidth();
  }

  zoomIn(): void {
    this.zoomBy(1.18);
  }

  zoomOut(): void {
    this.zoomBy(0.72);
  }

  exportSnapshot(): PlanPilotGraphSnapshot | undefined {
    if (!this.graph) {
      return undefined;
    }

    this.resizeGraph();
    this.updatePlanEdgeWidth();
    const viewportWidth = this.graphContainer.nativeElement.clientWidth;
    const viewportHeight = this.graphContainer.nativeElement.clientHeight;
    const insideViewport = (node: NodeSingular): boolean => {
      const box = node.renderedBoundingBox();
      return box.x1 >= 0 && box.y1 >= 0 && box.x2 <= viewportWidth && box.y2 <= viewportHeight;
    };
    return {
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        zoom: this.graph.zoom(),
        pan: this.graph.pan(),
        visibleFacetIds: this.graph.nodes('.facet')
          .filter((node) => insideViewport(node))
          .map((node) => node.id()),
      },
      imagePngDataUrl: this.graph.png({
        full: true,
        maxWidth: 4096,
        maxHeight: 4096,
        bg: '#f4f7f9',
      }),
      nodes: this.graph.nodes('.facet').map((node) => ({
        id: node.id(),
        label: String(node.data('label') ?? ''),
        classes: node.classes(),
        position: node.position(),
        renderedPosition: node.renderedPosition(),
        renderedSize: {
          width: node.renderedWidth(),
          height: node.renderedHeight(),
        },
        insideViewport: insideViewport(node),
        computedStyle: {
          backgroundColor: String(node.style('background-color')),
          borderColor: String(node.style('border-color')),
          borderStyle: String(node.style('border-style')),
          borderWidth: Number.parseFloat(String(node.style('border-width'))) || 0,
          shape: String(node.style('shape')),
          opacity: Number.parseFloat(String(node.style('opacity'))) || 0,
        },
      })),
      edges: this.graph.edges().filter((edge) => !edge.hasClass('level-edge')).map((edge) => {
        const renderedEdge = edge as EdgeSingular;
        const width = Number.parseFloat(String(edge.style('width'))) || 0;
        return {
          id: edge.id(),
          sourceId: String(edge.data('source')),
          targetId: String(edge.data('target')),
          label: String(edge.data('label') ?? ''),
          gapTimesteps: Array.isArray(edge.data('gapTimesteps')) ? edge.data('gapTimesteps') : [],
          classes: edge.classes(),
          width,
          renderedWidth: width * this.graph!.zoom(),
          sourceArrowShape: String(edge.style('source-arrow-shape')),
          targetArrowShape: String(edge.style('target-arrow-shape')),
          renderedSourceEndpoint: renderedEdge.renderedSourceEndpoint(),
          renderedTargetEndpoint: renderedEdge.renderedTargetEndpoint(),
        };
      }),
    };
  }

  resizeAndFit(): void {
    setTimeout(() => this.fitGraph());
  }

  focusFacet(facetId: string): void {
    setTimeout(() => {
      if (!this.graph) {
        return;
      }

      this.resizeGraph();
      const node = this.graph.getElementById(facetId);
      if (node.empty()) {
        return;
      }

      this.centerModelPosition(node.position());
    });
  }

  focusTimestep(timestep: number | 'any'): void {
    setTimeout(() => {
      if (!this.graph) {
        return;
      }

      this.resizeGraph();
      const matchingIds = this.facets
        .filter((facet) => timestep === 'any'
          ? Boolean(facet.abstractTimeStep)
          : !facet.abstractTimeStep && facet.timestep === timestep && facet.nodeType !== 'root')
        .map((facet) => facet.id);
      const matchingNodes = this.graph.nodes().filter((node) => matchingIds.includes(node.id()));
      if (matchingNodes.nonempty()) {
        const positions = matchingNodes.map((node) => (node as NodeSingular).position());
        this.centerModelPosition({
          x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
          y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
        });
        return;
      }

      const levelSuffix = timestep === 'any' ? 'any' : String(timestep);
      const left = this.graph.getElementById(`__level_${levelSuffix}_left`);
      const right = this.graph.getElementById(`__level_${levelSuffix}_right`);
      if (left.nonempty() && right.nonempty()) {
        this.centerModelPosition({
          x: (left.position('x') + right.position('x')) / 2,
          y: (left.position('y') + right.position('y')) / 2 + 96,
        });
      }
    });
  }

  private applySelection(): void {
    this.graph?.nodes().removeClass('selected');
    if (this.selectedFacetId) {
      this.graph?.getElementById(this.selectedFacetId).addClass('selected');
    }
  }

  private rebuildGraph(): void {
    if (!this.graph) {
      return;
    }

    const viewport = {
      pan: this.graph.pan(),
      zoom: this.graph.zoom(),
    };
    this.graph.elements().remove();
    this.graph.add(this.toElements());
    this.graph.layout(this.treeLayout(false)).run();
    this.graph.zoom(viewport.zoom);
    this.graph.pan(viewport.pan);
    this.updatePlanEdgeWidth();
  }

  private applyNodeClasses(): void {
    if (!this.graph) {
      return;
    }

    this.facets.forEach((facet) => {
      const node = this.graph?.getElementById(facet.id);
      if (!node || node.empty()) {
        return;
      }

      node.removeClass('positive negative neutral root goal time displayed-plan required forbidden alternative implied empty unavailable query solution-path user-constraint');
      node.addClass(`facet ${facet.selection} ${this.groupClass(facet)}`);
      node.data('label', this.nodeLabel(facet));
    });
  }

  private applyEdgeClasses(): void {
    if (!this.graph) {
      return;
    }

    this.connections.forEach((connection) => {
      const edge = this.graph?.getElementById(this.edgeId(connection.sourceId, connection.targetId));
      if (!edge || edge.empty()) {
        return;
      }

      edge.removeClass('plan-edge');
      edge.addClass(`${connection.kind}-edge`);
    });
    this.updatePlanEdgeWidth();
  }

  private toElements(): ElementDefinition[] {
    const facets = this.facets
      .map((facet, index) => ({ facet, index }))
      .sort((left, right) => left.facet.timestep - right.facet.timestep || left.index - right.index);
    const layout = this.timelineLayout(facets.map((entry) => entry.facet));
    const positions = layout.positions;

    const elements: ElementDefinition[] = facets.map(({ facet }) => ({
      data: {
        id: facet.id,
        label: this.nodeLabel(facet),
      },
      position: positions[facet.id],
      classes: `facet ${facet.selection} ${this.groupClass(facet)}`,
    }));

    elements.push(...this.levelElements(layout));

    const explicitConnections = this.connections.filter((connection) => (
      this.hasVisibleFacet(connection.sourceId) && this.hasVisibleFacet(connection.targetId)
    ));

    explicitConnections.forEach((connection) => {
      elements.push({
        data: {
          id: this.edgeId(connection.sourceId, connection.targetId),
          source: connection.sourceId,
          target: connection.targetId,
          label: connection.label ?? '',
          gapTimesteps: connection.gapTimesteps ?? [],
        },
        classes: `${connection.kind}-edge`,
      });
    });

    return elements;
  }

  private groupClass(facet: PlanPilotGraphFacet): string {
    const visualState = facet.visualState;
    return [
      visualState,
      visualState === 'displayed-plan' ? 'solution-path' : '',
      facet.userConstraint ? 'user-constraint' : '',
    ].filter(Boolean).join(' ');
  }

  private nodeLabel(facet: PlanPilotGraphFacet): string {
    const planCount = facet.remainingSolutions === null
      ? ''
      : ` | ${facet.remainingSolutions} plan${facet.remainingSolutions === 1 ? '' : 's'}`;
    const meta = facet.meta || `${facet.abstractTimeStep ? 'any step' : `t${facet.timestep}`}${planCount}`;
    return `${facet.label}\n${meta}`;
  }

  private hasVisibleFacet(facetId: string): boolean {
    return this.facets.some((facet) => facet.id === facetId);
  }

  private edgeId(sourceId: string, targetId: string): string {
    return `edge-${sourceId.length}:${sourceId}:${targetId.length}:${targetId}`;
  }

  private treeLayout(fit = true): cytoscape.LayoutOptions {
    return {
      name: 'preset',
      fit,
      padding: 36,
    };
  }

  private timelineLayout(facets: PlanPilotGraphFacet[]): {
    positions: Record<string, { x: number; y: number }>;
    timesteps: number[];
    yByTimestep: Map<number, number>;
    minX: number;
    maxX: number;
    abstractBand: boolean;
  } {
    const rowHeight = 160;
    const siblingWidth = 236;
    const laneGap = 96;
    const allContentNodes = facets.filter((facet) => facet.nodeType !== 'root' && facet.nodeType !== 'time');
    const abstractNodes = allContentNodes
      .filter((facet) => facet.abstractTimeStep)
      .sort((left, right) => this.nodeOrderWeight(left) - this.nodeOrderWeight(right) || left.label.localeCompare(right.label));
    const contentNodes = allContentNodes.filter((facet) => !facet.abstractTimeStep);
    const concreteTimesteps = this.horizon > 0
      ? Array.from({ length: this.horizon }, (_, index) => index + 1)
      : contentNodes.map((facet) => facet.timestep).filter((timestep) => timestep > 0);
    const timesteps = Array.from(new Set([
      ...concreteTimesteps,
      ...contentNodes.map((facet) => facet.timestep).filter((timestep) => timestep > 0),
    ])).sort((left, right) => left - right);
    const abstractColumns = Math.min(8, Math.max(abstractNodes.length, 1));
    const abstractRowGap = 116;
    const abstractRows = abstractNodes.length ? Math.ceil(abstractNodes.length / abstractColumns) : 0;
    const rootY = abstractRows ? (abstractRows * abstractRowGap) + 40 : -rowHeight;
    const concreteStartY = rootY + rowHeight;
    const yByTimestep = new Map(
      timesteps.map((timestep, index) => [timestep, concreteStartY + (index * rowHeight)]),
    );
    const laneOrder = [0, 1, 2, 3, 4];
    const maxCountByLane = new Map(laneOrder.map((lane) => [lane, 1]));
    const laneStartByLane = new Map<number, number>();
    const positions: Record<string, { x: number; y: number }> = {};

    abstractNodes.forEach((facet, index) => {
      positions[facet.id] = {
        x: (index % abstractColumns) * siblingWidth,
        y: Math.floor(index / abstractColumns) * abstractRowGap,
      };
    });

    timesteps.forEach((timestep) => {
      const counts = new Map<number, number>();
      contentNodes
        .filter((facet) => facet.timestep === timestep)
        .forEach((facet) => {
          const lane = this.nodeLane(facet);
          counts.set(lane, (counts.get(lane) ?? 0) + 1);
        });

      counts.forEach((count, lane) => {
        maxCountByLane.set(lane, Math.max(maxCountByLane.get(lane) ?? 1, count));
      });
    });

    let nextLaneStart = 0;
    laneOrder.forEach((lane) => {
      laneStartByLane.set(lane, nextLaneStart);
      nextLaneStart += ((maxCountByLane.get(lane) ?? 1) * siblingWidth) + laneGap;
    });

    timesteps.forEach((timestep) => {
      const timestepFacets = contentNodes
        .filter((facet) => facet.timestep === timestep)
        .sort((left, right) => this.nodeOrderWeight(left) - this.nodeOrderWeight(right) || left.label.localeCompare(right.label));
      const lanes = new Map<number, PlanPilotGraphFacet[]>();
      timestepFacets.forEach((facet) => {
        const lane = this.nodeLane(facet);
        lanes.set(lane, [...(lanes.get(lane) ?? []), facet]);
      });

      Array.from(lanes.entries()).forEach(([lane, laneFacets]) => {
        const maxLaneCount = maxCountByLane.get(lane) ?? laneFacets.length;
        const laneStart = laneStartByLane.get(lane) ?? 0;
        const centeredOffset = ((maxLaneCount - laneFacets.length) * siblingWidth) / 2;
        laneFacets.forEach((facet, index) => {
          positions[facet.id] = {
            x: laneStart + centeredOffset + (index * siblingWidth),
            y: yByTimestep.get(timestep) ?? rowHeight,
          };
        });
      });
    });

    const minX = -140;
    const abstractWidth = abstractNodes.length
      ? ((Math.min(abstractNodes.length, abstractColumns) - 1) * siblingWidth) + 216
      : 0;
    const maxX = Math.max(720, nextLaneStart - laneGap + 140, abstractWidth + 140);
    facets
      .filter((facet) => facet.nodeType === 'root')
      .forEach((facet) => {
        const planLaneCenter = ((maxCountByLane.get(0) ?? 1) - 1) * siblingWidth / 2;
        positions[facet.id] = { x: planLaneCenter, y: rootY };
      });

    return {
      positions,
      timesteps,
      yByTimestep,
      minX,
      maxX,
      abstractBand: abstractNodes.length > 0,
    };
  }

  private levelElements(layout: {
    timesteps: number[];
    yByTimestep: Map<number, number>;
    minX: number;
    maxX: number;
    abstractBand: boolean;
  }): ElementDefinition[] {
    const abstractElements: ElementDefinition[] = layout.abstractBand
      ? [
        {
          data: { id: '__level_any_left' },
          position: { x: layout.minX, y: -72 },
          classes: 'level-anchor',
        },
        {
          data: { id: '__level_any_right' },
          position: { x: layout.maxX, y: -72 },
          classes: 'level-anchor',
        },
        {
          data: {
            id: '__level_any',
            source: '__level_any_left',
            target: '__level_any_right',
            label: 'Any step (not a timeline step)',
          },
          classes: 'level-edge',
        },
      ]
      : [];
    const timelineElements = layout.timesteps.flatMap((timestep) => {
      const y = layout.yByTimestep.get(timestep) ?? 0;
      const lineY = y - 96;
      const leftId = `__level_${timestep}_left`;
      const rightId = `__level_${timestep}_right`;

      return [
        {
          data: { id: leftId },
          position: { x: layout.minX, y: lineY },
          classes: 'level-anchor',
        },
        {
          data: { id: rightId },
          position: { x: layout.maxX, y: lineY },
          classes: 'level-anchor',
        },
        {
          data: {
            id: `__level_${timestep}`,
            source: leftId,
            target: rightId,
            label: `t${timestep}`,
          },
          classes: 'level-edge',
        },
      ];
    });
    return [...abstractElements, ...timelineElements];
  }

  private nodeLane(facet: PlanPilotGraphFacet): number {
    switch (facet.visualState) {
      case 'displayed-plan':
      case 'required':
        return 0;
      case 'implied':
        return 1;
      case 'forbidden':
        return 3;
      case 'unavailable':
      case 'query':
        return 4;
      default:
        return 2;
    }
  }

  private nodeOrderWeight(facet: PlanPilotGraphFacet): number {
    return this.nodeLane(facet);
  }

  private structureSignature(): string {
    const facetIds = this.facets
      .map((facet) => `${facet.id}:${facet.selection}:${facet.nodeType ?? ''}:${facet.group}:${facet.timestep}:${facet.abstractTimeStep ?? false}:${facet.available ?? true}:${facet.solutionContext ?? false}:${facet.userConstraint ?? false}:${facet.meta ?? ''}`)
      .sort()
      .join('|');
    const connections = this.connections
      .map((connection) => `${connection.sourceId}>${connection.targetId}:${connection.kind}:${connection.gapTimesteps?.join(',') ?? ''}`)
      .sort()
      .join('|');

    return `${this.horizon}:${facetIds}::${connections}`;
  }

  private resizeGraph(): void {
    this.graph?.resize();
  }

  private updatePlanEdgeWidth(): void {
    if (!this.graph) {
      return;
    }
    const zoom = Math.max(this.graph.zoom(), this.graph.minZoom());
    const width = Math.max(
      this.basePlanEdgeWidth,
      this.minimumRenderedPlanEdgeWidth / zoom,
    );
    this.graph.edges('.plan-edge').style('width', width);
  }

  private centerModelPosition(position: { x: number; y: number }): void {
    if (!this.graph) {
      return;
    }

    const zoom = this.graph.zoom();
    const center = {
      x: this.graphContainer.nativeElement.clientWidth / 2,
      y: this.graphContainer.nativeElement.clientHeight / 2,
    };

    this.graph.animate({
      pan: {
        x: center.x - (position.x * zoom),
        y: center.y - (position.y * zoom),
      },
    }, {
      duration: 220,
      easing: 'ease-out',
    });
  }

  private zoomBy(factor: number): void {
    if (!this.graph) {
      return;
    }

    const currentZoom = this.graph.zoom();
    const nextZoom = Math.max(this.graph.minZoom(), Math.min(this.graph.maxZoom(), currentZoom * factor));
    this.graph.zoom({
      level: nextZoom,
      renderedPosition: {
        x: this.graphContainer.nativeElement.clientWidth / 2,
        y: this.graphContainer.nativeElement.clientHeight / 2,
      },
    });
  }

  private tapPosition(event: EventObject): PlanPilotGraphTap {
    const positionedEvent = event as EventObject & { renderedPosition?: { x: number; y: number } };
    return {
      x: positionedEvent.renderedPosition?.x ?? 240,
      y: positionedEvent.renderedPosition?.y ?? 140,
    };
  }
}
