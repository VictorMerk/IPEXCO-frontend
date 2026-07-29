export interface PlanPilotError {
  code?: string;
  message: string;
  details?: unknown;
}

export function planPilotError(error: unknown): PlanPilotError {
  const root = recordValue(error);
  const responseBody = objectValue(error, "error");
  const apiBody = objectValue(responseBody, "error") ?? responseBody ?? root;
  const code = stringValue(apiBody, "code");
  const message = stringValue(apiBody, "message");

  if (code === "PLAN_SPACE_TOO_LARGE" || code === "PLANPILOT_TIMEOUT") {
    return {
      code,
      message:
        "PlanPilot did not finish in time. Try a smaller horizon or exact mode.",
      details: objectValue(apiBody, "details"),
    };
  }
  if (message) {
    return {
      code,
      message,
      details: objectValue(apiBody, "details"),
    };
  }

  return {
    code,
    message:
      stringValue(error, "message") ?? "PlanPilot backend request failed.",
    details: objectValue(apiBody, "details"),
  };
}

export function hasPlanPilotErrorCode(
  error: unknown,
  ...codes: string[]
): boolean {
  const code = planPilotError(error).code;
  return code !== undefined && codes.includes(code);
}

function objectValue(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const record = recordValue(value);
  if (!record) {
    return undefined;
  }
  const nested = record[key];
  return nested && typeof nested === "object"
    ? (nested as Record<string, unknown>)
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}
