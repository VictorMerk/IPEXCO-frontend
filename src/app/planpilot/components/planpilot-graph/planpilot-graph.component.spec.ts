import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Core } from 'cytoscape';
import { PlanPilotGraphComponent, PlanPilotGraphFacet } from './planpilot-graph.component';
import { PLANPILOT_GRAPH_STYLES } from './planpilot-graph.styles';

describe('PlanPilotGraphComponent', () => {
  let fixture: ComponentFixture<PlanPilotGraphComponent>;
  let component: PlanPilotGraphComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlanPilotGraphComponent] }).compileComponents();
    fixture = TestBed.createComponent(PlanPilotGraphComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('keeps a forbidden displayed action red', () => {
    const style = PLANPILOT_GRAPH_STYLES.find(
      (entry) => entry.selector === 'node.displayed-plan.user-constraint.negative',
    ) as { style?: Record<string, unknown> } | undefined;

    expect(style?.style?.['background-color']).toBe('#ffe0db');
    expect(style?.style?.['border-color']).toBe('#b91c1c');
  });

  it('renders a plan edge from the earlier action to the later action', () => {
    component.facets = [planFacet('action-1', 1), planFacet('action-2', 2)];
    component.connections = [{ sourceId: 'action-1', targetId: 'action-2', kind: 'plan' }];
    component.horizon = 2;

    fixture.detectChanges();

    const edge = component.exportSnapshot()?.edges.find((item) => (
      item.sourceId === 'action-1' && item.targetId === 'action-2'
    ));
    expect(edge).toBeDefined();
    expect(edge?.sourceId).toBe('action-1');
    expect(edge?.targetId).toBe('action-2');
    expect(edge?.sourceArrowShape).toBe('none');
    expect(edge?.targetArrowShape).toBe('triangle');
    expect(edge!.renderedSourceEndpoint.y).toBeLessThan(edge!.renderedTargetEndpoint.y);
  });

  it('keeps bounded gap metadata on the rendered edge', () => {
    component.facets = [planFacet('action-3', 3), planFacet('action-5', 5)];
    component.connections = [{
      sourceId: 'action-3',
      targetId: 'action-5',
      kind: 'plan',
      gapTimesteps: [4],
      label: 't4 empty',
    }];
    component.horizon = 5;

    fixture.detectChanges();

    const edge = component.exportSnapshot()?.edges[0];
    expect(edge?.label).toBe('t4 empty');
    expect(edge?.gapTimesteps).toEqual([4]);
  });

  it('keeps plan edges visible when a dense graph is fitted at a low zoom', () => {
    component.facets = [planFacet('action-1', 1), planFacet('action-2', 2)];
    component.connections = [{ sourceId: 'action-1', targetId: 'action-2', kind: 'plan' }];
    component.horizon = 2;
    fixture.detectChanges();

    const graph = (component as unknown as { graph: Core }).graph;
    graph.zoom(0.08);

    const edge = component.exportSnapshot()?.edges[0];
    expect(edge?.renderedWidth).toBeGreaterThanOrEqual(2);
    expect(edge?.width).toBeGreaterThanOrEqual(25);
  });

  it('exports the computed Cytoscape node style for graph diagnostics', () => {
    component.facets = [planFacet('action-1', 1)];
    component.horizon = 1;

    fixture.detectChanges();

    const node = component.exportSnapshot()?.nodes.find((item) => item.id === 'action-1');
    expect(node?.computedStyle).toEqual({
      backgroundColor: 'rgb(220,252,231)',
      borderColor: 'rgb(21,128,61)',
      borderStyle: 'solid',
      borderWidth: 3,
      shape: 'round-rectangle',
      opacity: 1,
    });
  });

  it('fits the complete displayed plan from root to goal in the viewport', () => {
    fixture.nativeElement.style.display = 'block';
    fixture.nativeElement.style.width = '1200px';
    fixture.nativeElement.style.height = '735px';
    const actions = Array.from({ length: 10 }, (_, index) => planFacet(`action-${index + 1}`, index + 1));
    const root = { ...planFacet('__session__', -1), nodeType: 'root' as const, solutionContext: false, visualState: 'root' as const };
    const goal = { ...planFacet('__goal__', 11), nodeType: 'goal' as const, visualState: 'goal' as const };
    component.facets = [root, ...actions, goal];
    component.connections = [
      { sourceId: '__session__', targetId: 'action-1', kind: 'plan' },
      ...actions.slice(1).map((action, index) => ({
        sourceId: actions[index].id,
        targetId: action.id,
        kind: 'plan' as const,
      })),
      { sourceId: 'action-10', targetId: '__goal__', kind: 'plan' },
    ];
    component.horizon = 10;

    fixture.detectChanges();
    component.fitGraph();

    const snapshot = component.exportSnapshot();
    expect(snapshot?.viewport.width).toBeGreaterThan(0);
    expect(snapshot?.viewport.height).toBeGreaterThan(0);
    expect(snapshot?.viewport.visibleFacetIds).toEqual(
      jasmine.arrayContaining(['__session__', ...actions.map((action) => action.id), '__goal__']),
    );
    const displayedNodes = snapshot!.nodes.filter((node) => (
      node.id === '__session__' || node.id === '__goal__' || node.id.startsWith('action-')
    ));
    const displayedPlanCenter = (
      Math.min(...displayedNodes.map((node) => node.renderedPosition.x))
      + Math.max(...displayedNodes.map((node) => node.renderedPosition.x))
    ) / 2;
    expect(Math.abs(displayedPlanCenter - snapshot!.viewport.width / 2)).toBeLessThan(24);
    expect(Math.min(...(snapshot?.edges.map((edge) => edge.renderedWidth) ?? [0])))
      .toBeGreaterThanOrEqual(2);
  });

  it('keeps any-step choices outside the timeline and wraps a dense row', () => {
    const root = { ...planFacet('__session__', -1), nodeType: 'root' as const, solutionContext: false, visualState: 'root' as const };
    const anyStep = Array.from({ length: 24 }, (_, index): PlanPilotGraphFacet => ({
      ...planFacet(`any-${index + 1}`, 0),
      group: index < 8 ? 'In every plan' : 'Open candidate',
      selection: 'neutral',
      solutionContext: false,
      nodeType: index < 8 ? undefined : 'candidate',
      visualState: index < 8 ? 'implied' : 'alternative',
      abstractTimeStep: true,
    }));
    const concrete = Array.from({ length: 4 }, (_, index): PlanPilotGraphFacet => ({
      ...planFacet(`choice-${index + 1}`, 1),
      group: 'Open candidate',
      selection: 'neutral',
      solutionContext: false,
      nodeType: 'candidate',
      visualState: 'alternative',
    }));
    component.facets = [root, ...anyStep, ...concrete];
    component.horizon = 2;

    fixture.detectChanges();

    const snapshot = component.exportSnapshot()!;
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const anyStepNodes = anyStep.map((facet) => byId.get(facet.id)!);
    const concreteNodes = concrete.map((facet) => byId.get(facet.id)!);
    const anyStepRows = new Set(anyStepNodes.map((node) => node.position.y));
    const anyStepXs = anyStepNodes.map((node) => node.position.x);
    expect(anyStepRows.size).toBe(3);
    expect(Math.max(...anyStepXs) - Math.min(...anyStepXs)).toBeLessThanOrEqual(7 * 236);
    expect(byId.get('__session__')!.position.y)
      .toBeGreaterThan(Math.max(...anyStepNodes.map((node) => node.position.y)));
    expect(Math.max(...concreteNodes.map((node) => node.position.x))).toBeLessThan(2000);
    expect(anyStepNodes.every((node) => node.label.includes('any step'))).toBeTrue();
    expect(anyStepNodes.every((node) => !node.label.includes('t0'))).toBeTrue();

    const elements = (component as unknown as {
      toElements: () => Array<{ data: { id?: string; label?: string } }>;
    }).toElements();
    expect(elements.find((element) => element.data.id === '__level_any')?.data.label)
      .toBe('Any step (not a timeline step)');
  });

  it('maps every typed visual state to its own class and lane without reading display text', () => {
    const graph = component as unknown as {
      groupClass: (facet: PlanPilotGraphFacet) => string;
      nodeLane: (facet: PlanPilotGraphFacet) => number;
    };
    const expectedLanes = {
      root: 2,
      goal: 2,
      time: 2,
      'displayed-plan': 0,
      required: 0,
      forbidden: 3,
      alternative: 2,
      implied: 1,
      empty: 2,
      unavailable: 4,
      query: 4,
    } as const;

    Object.entries(expectedLanes).forEach(([visualState, lane]) => {
      const candidate: PlanPilotGraphFacet = {
        ...planFacet(`state-${visualState}`, 1),
        group: 'This text must not classify the node',
        selection: 'neutral',
        solutionContext: false,
        visualState: visualState as PlanPilotGraphFacet['visualState'],
      };
      expect(graph.groupClass(candidate).split(' ')).toContain(visualState);
      expect(graph.nodeLane(candidate)).toBe(lane);
    });
  });

  it('defines one base style for every typed visual state and no legacy display-text classes', () => {
    const selectors = PLANPILOT_GRAPH_STYLES.map((entry) => String(entry.selector));
    const baseSelectors = [
      'node.facet.root',
      'node.facet.goal',
      'node.time',
      'node.displayed-plan',
      'node.required',
      'node.forbidden',
      'node.alternative',
      'node.implied',
      'node.empty',
      'node.unavailable',
      'node.query',
    ];

    baseSelectors.forEach((selector) => {
      expect(selectors.filter((candidate) => candidate === selector).length)
        .withContext(selector)
        .toBe(1);
    });
    expect(selectors).not.toContain('node.path');
    expect(selectors).not.toContain('node.candidate');
    expect(selectors).not.toContain('node.excluded-node');
  });
});

function planFacet(id: string, timestep: number): PlanPilotGraphFacet {
  return {
    id,
    label: id,
    timestep,
    action: id,
    group: 'Plan',
    selection: 'positive',
    remainingSolutions: 1,
    solutionContext: true,
    visualState: 'displayed-plan',
  };
}
