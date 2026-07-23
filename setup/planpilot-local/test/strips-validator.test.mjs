import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStripsTask, validateStripsPlan } from '../lib/strips-validator.mjs';

const fixtureDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../example_data/planpilot-demo',
);
const task = parseStripsTask(
  readFileSync(resolve(fixtureDirectory, 'domain-planpilot-towers.pddl'), 'utf8'),
  readFileSync(resolve(fixtureDirectory, 'problem-planpilot-towers-4.pddl'), 'utf8'),
);
const validPlan = [
  ['unstack', 'a', 'b'],
  ['put-down', 'a'],
  ['unstack', 'b', 'c'],
  ['stack', 'b', 'a'],
  ['pick-up', 'c'],
  ['stack', 'c', 'b'],
  ['pick-up', 'd'],
  ['stack', 'd', 'c'],
].map(([name, ...argumentsList]) => ({ name, arguments: argumentsList }));

test('replays the demo solution and reaches every goal literal', () => {
  const result = validateStripsPlan(task, validPlan);
  assert.equal(result.valid, true);
  assert.equal(result.actionCount, 8);
  assert.equal(result.trace.length, 8);
});

test('reports the first inapplicable action', () => {
  assert.throws(
    () => validateStripsPlan(task, [validPlan[1], ...validPlan.slice(1)]),
    /Step 1 .* is not applicable/,
  );
});

test('rejects an executable prefix that does not reach the goal', () => {
  assert.throws(
    () => validateStripsPlan(task, validPlan.slice(0, 2)),
    /does not reach the goal/,
  );
});
