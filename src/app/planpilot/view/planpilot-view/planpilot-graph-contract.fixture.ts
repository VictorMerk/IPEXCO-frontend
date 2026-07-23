import { PlanPilotGraphConnection } from '../../components/planpilot-graph/planpilot-graph.component';
import { PlanPilotFacet } from '../../service/planpilot.service';

/**
 * Fixed API example used to check the frontend/backend graph contract.
 * Expected edges are written out below and are not produced by graph code.
 */
export const PLANPILOT_GRAPH_CONTRACT = {
  facets: [
    {
      id: 'pick-a-t1',
      label: 'pick up a',
      timestep: 1,
      selectionState: 'positive',
      facetType: 'plan',
    },
    {
      id: 'move-b-t2',
      label: 'move b',
      timestep: 2,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'pick-a-t1',
    },
    {
      id: 'stack-a-b-t3',
      label: 'stack a on b',
      timestep: 3,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'move-b-t2',
    },
    {
      id: 'move-c-t5',
      label: 'move c',
      timestep: 5,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'stack-a-b-t3',
    },
    {
      id: 'alternative-t3',
      label: 'put down a',
      timestep: 3,
      selectionState: 'neutral',
      facetType: 'optional',
    },
  ] satisfies PlanPilotFacet[],
  solution: [
    {
      id: 'pick-a-t1',
      label: 'pick up a',
      timestep: 1,
      selectionState: 'positive',
      facetType: 'plan',
    },
    {
      id: 'move-b-t2',
      label: 'move b',
      timestep: 2,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'pick-a-t1',
    },
    {
      id: 'stack-a-b-t3',
      label: 'stack a on b',
      timestep: 3,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'move-b-t2',
    },
    {
      id: 'move-c-t5',
      label: 'move c',
      timestep: 5,
      selectionState: 'positive',
      facetType: 'plan',
      parentId: 'stack-a-b-t3',
    },
  ] satisfies PlanPilotFacet[],
  expectedConnections: [
    { sourceId: 'pick-a-t1', targetId: 'move-b-t2', kind: 'plan' },
    { sourceId: 'move-b-t2', targetId: 'stack-a-b-t3', kind: 'plan' },
    {
      sourceId: 'stack-a-b-t3',
      targetId: 'move-c-t5',
      kind: 'plan',
      gapTimesteps: [4],
      label: 't4 empty',
    },
    { sourceId: 'move-c-t5', targetId: '__goal__', kind: 'plan' },
    { sourceId: '__session__', targetId: 'pick-a-t1', kind: 'plan' },
  ] satisfies PlanPilotGraphConnection[],
};
