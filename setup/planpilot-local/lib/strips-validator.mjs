const LOGICAL_OPERATORS = new Set(['and', 'not']);

export function parseStripsTask(domainPddl, problemPddl) {
  const domain = parseDocument(domainPddl, 'domain');
  const problem = parseDocument(problemPddl, 'problem');
  const actions = new Map();

  for (const section of domain.slice(1)) {
    if (!Array.isArray(section) || section[0] !== ':action') {
      continue;
    }
    const name = section[1];
    const fields = keyedFields(section.slice(2));
    const parameters = untypedSymbols(fields.get(':parameters') ?? []);
    actions.set(name, {
      name,
      parameters,
      preconditions: literals(fields.get(':precondition') ?? ['and'], `${name} precondition`),
      effects: literals(fields.get(':effect') ?? ['and'], `${name} effect`),
    });
  }

  if (!actions.size) {
    throw new Error('The domain contains no STRIPS actions.');
  }

  const initialSection = findSection(problem, ':init');
  const goalSection = findSection(problem, ':goal');
  const initialState = new Set(
    initialSection.slice(1).map((atom) => groundAtom(atom, new Map(), 'initial state')),
  );
  const goals = literals(goalSection[1], 'goal');

  return { actions, initialState, goals };
}

export function validateStripsPlan(task, plan) {
  if (!Array.isArray(plan)) {
    throw new Error('The plan must be an array.');
  }

  const state = new Set(task.initialState);
  const trace = [];
  plan.forEach((rawStep, index) => {
    const step = normalizeStep(rawStep);
    const action = task.actions.get(step.name);
    if (!action) {
      throw new Error(`Step ${index + 1} uses unknown action ${JSON.stringify(step.name)}.`);
    }
    if (action.parameters.length !== step.arguments.length) {
      throw new Error(
        `Step ${index + 1} (${step.name}) expects ${action.parameters.length} arguments, got ${step.arguments.length}.`,
      );
    }

    const binding = new Map(action.parameters.map((parameter, position) => (
      [parameter, step.arguments[position]]
    )));
    const groundedPreconditions = action.preconditions.map((literal) => groundLiteral(literal, binding));
    const unsatisfied = groundedPreconditions.filter((literal) => !literalHolds(state, literal));
    if (unsatisfied.length) {
      throw new Error(
        `Step ${index + 1} (${formatStep(step)}) is not applicable; missing ${unsatisfied.map(formatLiteral).join(', ')}.`,
      );
    }

    const groundedEffects = action.effects.map((literal) => groundLiteral(literal, binding));
    groundedEffects.filter((literal) => literal.negative).forEach((literal) => state.delete(literal.atom));
    groundedEffects.filter((literal) => !literal.negative).forEach((literal) => state.add(literal.atom));
    trace.push({
      step: index + 1,
      action: formatStep(step),
      added: groundedEffects.filter((literal) => !literal.negative).map((literal) => literal.atom),
      removed: groundedEffects.filter((literal) => literal.negative).map((literal) => literal.atom),
    });
  });

  const groundedGoals = task.goals.map((literal) => groundLiteral(literal, new Map()));
  const unsatisfiedGoals = groundedGoals.filter((literal) => !literalHolds(state, literal));
  if (unsatisfiedGoals.length) {
    throw new Error(`The plan does not reach the goal; missing ${unsatisfiedGoals.map(formatLiteral).join(', ')}.`);
  }

  return {
    valid: true,
    actionCount: plan.length,
    finalState: [...state].sort(),
    trace,
  };
}

export function backendSolutionSteps(solution) {
  const facets = Array.isArray(solution?.facets) ? solution.facets : solution;
  if (!Array.isArray(facets)) {
    throw new Error('The PlanPilot solution contains no facets.');
  }
  return [...facets]
    .sort((left, right) => (left.timestep ?? 0) - (right.timestep ?? 0))
    .map((facet) => ({
      name: facet.action?.name,
      arguments: facet.action?.arguments,
    }));
}

export function diagnosticSolutionSteps(facets) {
  if (!Array.isArray(facets)) {
    throw new Error('The diagnostic contains no representative solution.');
  }
  return [...facets]
    .sort((left, right) => left.timestep - right.timestep)
    .map((facet) => ({ name: facet.action, arguments: facet.actionArguments }));
}

function parseDocument(source, label) {
  const tokens = String(source)
    .replace(/;[^\n\r]*/g, '')
    .match(/\(|\)|[^\s()]+/g) ?? [];
  let position = 0;
  const read = () => {
    const token = tokens[position++];
    if (token !== '(') {
      return token;
    }
    const result = [];
    while (position < tokens.length && tokens[position] !== ')') {
      result.push(read());
    }
    if (tokens[position++] !== ')') {
      throw new Error(`Unclosed expression in ${label} PDDL.`);
    }
    return result;
  };
  const document = read();
  if (position !== tokens.length || !Array.isArray(document) || document[0] !== 'define') {
    throw new Error(`Invalid ${label} PDDL document.`);
  }
  return document;
}

function keyedFields(items) {
  const fields = new Map();
  for (let index = 0; index < items.length; index += 2) {
    if (typeof items[index] !== 'string' || !items[index].startsWith(':')) {
      throw new Error(`Invalid action field ${JSON.stringify(items[index])}.`);
    }
    fields.set(items[index], items[index + 1]);
  }
  return fields;
}

function findSection(document, name) {
  const section = document.find((item) => Array.isArray(item) && item[0] === name);
  if (!section) {
    throw new Error(`The problem contains no ${name} section.`);
  }
  return section;
}

function untypedSymbols(expression) {
  const symbols = [];
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === '-') {
      index += 1;
    } else {
      symbols.push(expression[index]);
    }
  }
  return symbols;
}

function literals(expression, label) {
  if (!Array.isArray(expression) || expression.length === 0) {
    throw new Error(`Invalid ${label}.`);
  }
  const entries = expression[0] === 'and' ? expression.slice(1) : [expression];
  return entries.map((entry) => {
    if (!Array.isArray(entry) || !entry.length) {
      throw new Error(`Invalid literal in ${label}.`);
    }
    if (entry[0] === 'not') {
      if (entry.length !== 2 || !Array.isArray(entry[1])) {
        throw new Error(`Invalid negation in ${label}.`);
      }
      return { negative: true, atom: entry[1] };
    }
    if (LOGICAL_OPERATORS.has(entry[0])) {
      throw new Error(`Unsupported nested logical expression in ${label}.`);
    }
    return { negative: false, atom: entry };
  });
}

function groundLiteral(literal, binding) {
  return {
    negative: literal.negative,
    atom: groundAtom(literal.atom, binding, 'literal'),
  };
}

function groundAtom(atom, binding, label) {
  if (!Array.isArray(atom) || !atom.length) {
    throw new Error(`Invalid ${label} atom.`);
  }
  const grounded = atom.map((symbol, index) => {
    if (index === 0 || !String(symbol).startsWith('?')) {
      return symbol;
    }
    const value = binding.get(symbol);
    if (value === undefined) {
      throw new Error(`Unbound variable ${symbol} in ${label}.`);
    }
    return value;
  });
  return JSON.stringify(grounded);
}

function normalizeStep(step) {
  const name = step?.name;
  const argumentsList = step?.arguments ?? step?.params;
  if (typeof name !== 'string' || !name || !Array.isArray(argumentsList)
    || argumentsList.some((argument) => typeof argument !== 'string')) {
    throw new Error(`Invalid plan step: ${JSON.stringify(step)}.`);
  }
  return { name, arguments: argumentsList };
}

function literalHolds(state, literal) {
  return literal.negative ? !state.has(literal.atom) : state.has(literal.atom);
}

function formatLiteral(literal) {
  const atom = JSON.parse(literal.atom);
  const formatted = `(${atom.join(' ')})`;
  return literal.negative ? `not ${formatted}` : formatted;
}

function formatStep(step) {
  return `${step.name} ${step.arguments.join(' ')}`.trim();
}
