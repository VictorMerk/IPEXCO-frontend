import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const frontendRoot = resolve(import.meta.dirname, "../..");
const apiBase = (process.env.IPEXCO_API_URL ?? "http://127.0.0.1:3000/api").replace(
  /\/+$/,
  "",
);
const uiBase = (process.env.IPEXCO_UI_URL ?? "http://127.0.0.1:4200").replace(
  /\/+$/,
  "",
);
const username = process.env.IPEXCO_DEMO_USER ?? "planpilot-demo";
const password = process.env.IPEXCO_DEMO_PASSWORD ?? "planpilot-demo";
const apiKey = process.env.PLANPILOT_API_KEY ?? "ipexco-demo-api-key";

async function request(path, { token, method = "GET", body, allow } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok && !allow?.includes(response.status)) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`.trim());
  }
  return { status: response.status, data };
}

async function loginOrRegister() {
  const login = await request("/users/login", {
    method: "POST",
    body: { name: username, password },
    allow: [400, 401],
  });
  if (login.status === 200) {
    return login.data.data.token;
  }

  const registration = await request("/users/", {
    method: "POST",
    body: { name: username, password },
    allow: [400],
  });
  if (registration.status === 201) {
    return registration.data.data.token;
  }

  throw new Error(
    `The demo user '${username}' already exists with another password. ` +
      "Set IPEXCO_DEMO_PASSWORD to its password or remove local demo data.",
  );
}

async function ensureServices(token) {
  const existing = (await request("/services", { token })).data;
  const definitions = [
    ["PlanPilot", "PLANPILOT", "http://planpilot:5000"],
    ["Fast Downward", "PLANNER", "http://planner-fd:3333"],
    ["Explainer", "EXPLAINER", "http://explainer:3334"],
    ["Property Checker", "PROPERTY_CHECKER", "http://property-checker:3335"],
  ];

  const ids = [];
  for (const [name, type, url] of definitions) {
    let service = existing.find(
      (candidate) => candidate.type === type && candidate.url === url,
    );
    if (!service) {
      service = (
        await request("/services", {
          token,
          method: "POST",
          body: {
            name,
            type,
            domainId: null,
            url,
            apiKey,
            encoding: "PDDL_CLASSIC",
          },
        })
      ).data;
      console.log(`Created service: ${name}`);
    } else if (
      service.name !== name ||
      service.apiKey !== apiKey ||
      service.encoding !== "PDDL_CLASSIC" ||
      service.domainId !== null
    ) {
      service = (
        await request(`/services/${service._id}`, {
          token,
          method: "PUT",
          body: {
            name,
            type,
            domainId: null,
            url,
            apiKey,
            encoding: "PDDL_CLASSIC",
          },
        })
      ).data;
      console.log(`Updated service: ${name}`);
    }
    ids.push(service._id);
  }
  return ids;
}

async function ensureDomain(token) {
  const domains = (await request("/domain-spec", { token })).data;
  const existing = domains.find(
    (domain) =>
      domain.name === "PlanPilot Towers" && domain.encoding === "PDDL_CLASSIC",
  );
  if (existing) {
    return existing;
  }

  console.log("Created domain specification: PlanPilot Towers");
  return (
    await request("/domain-spec", {
      token,
      method: "POST",
      body: {
        name: "PlanPilot Towers",
        encoding: "PDDL_CLASSIC",
        planPropertyTemplates: [],
        description: "Small blocksworld example for the PlanPilot views.",
      },
    })
  ).data;
}

function projectSettings(serviceIds) {
  return {
    main: { public: false, maxRuns: 100, usePlanPropertyUtility: false },
    services: {
      computePlanAutomatically: true,
      computeExplanationsAutomatically: true,
      services: serviceIds,
    },
    interfaces: {
      propertyCreationInterfaceType: "TEMPLATE_BASED",
      explanationInterfaceType: "TEMPLATE_QUESTION_ANSWER",
      questionAnswerDelay: null,
    },
    llmConfig: {
      model: "gpt-4o-mini",
      temperature: 0,
      maxCompletionTokens: null,
      prompts: [],
      outputSchema: [],
      goalTranslator: false,
      showReverseTranslation: false,
      llmContextSetup: "ITERATION_STEP",
    },
    userStudy: {
      introTask: false,
      checkMaxUtility: true,
      showPaymentInfo: false,
      paymentInfo: { min: 0, max: 10, steps: [0.5, 0.75, 1] },
    },
  };
}

async function ensureProject(token, domain, serviceIds) {
  const domainPddl = readFileSync(
    resolve(
      frontendRoot,
      "setup/example_data/planpilot-demo/domain-planpilot-towers.pddl",
    ),
    "utf8",
  );
  const problemPddl = readFileSync(
    resolve(
      frontendRoot,
      "setup/example_data/planpilot-demo/problem-planpilot-towers-4.pddl",
    ),
    "utf8",
  );
  const parsed = (
    await request("/pddl/model", {
      token,
      method: "POST",
      body: { data: { domain: domainPddl, problem: problemPddl } },
    })
  ).data;

  const projectBody = {
    name: "PlanPilot Towers",
    public: false,
    domain: domain._id,
    description: "Explore the Towers plans with facets and the graph.",
    instanceInfo: null,
    summaryImage: null,
    baseTask: {
      name: "PlanPilot Towers",
      objects: parsed.data.objects,
      model: parsed.data,
    },
    settings: projectSettings(serviceIds),
  };

  const projects = (await request("/project/", { token })).data;
  const existing = projects.find((project) => project.name === projectBody.name);
  if (!existing) {
    console.log("Created project: PlanPilot Towers");
    return (
      await request("/project/", {
        token,
        method: "POST",
        body: projectBody,
      })
    ).data;
  }

  const selected = existing.settings?.services?.services ?? [];
  const isCurrent =
    String(existing.domain) === String(domain._id) &&
    selected.length === serviceIds.length &&
    serviceIds.every((id) => selected.includes(id));
  if (!isCurrent) {
    console.log("Updated project services: PlanPilot Towers");
    return (
      await request(`/project/${existing._id}`, {
        token,
        method: "PUT",
        body: {
          ...existing,
          domain: domain._id,
          settings: projectBody.settings,
        },
      })
    ).data;
  }
  return existing;
}

async function main() {
  const health = await request("/health", { allow: [404, 502, 503] });
  if (health.status !== 200) {
    throw new Error(
      `IPEXCO is not ready at ${apiBase}. Run ./start-ipexco.sh first.`,
    );
  }

  const token = await loginOrRegister();
  const serviceIds = await ensureServices(token);
  const domain = await ensureDomain(token);
  const project = await ensureProject(token, domain, serviceIds);
  const projectId = String(project._id);

  console.log("");
  console.log("PlanPilot demo is ready.");
  console.log(`Login: ${username} / ${password}`);
  console.log(`Project: ${uiBase}/project/${projectId}`);
  console.log(`Facet Navigation: ${uiBase}/planpilot/${projectId}`);
  console.log(`Graph: ${uiBase}/planpilot/${projectId}/graph`);
  console.log("Suggested graph settings: bounded, horizon 10.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
