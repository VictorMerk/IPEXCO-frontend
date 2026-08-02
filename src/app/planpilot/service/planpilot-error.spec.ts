import { hasPlanPilotErrorCode, planPilotError } from "./planpilot-error";

describe("PlanPilot API errors", () => {
  it("reads the nested backend error envelope", () => {
    const error = {
      error: {
        error: {
          code: "PLANPILOT_RUN_EXPIRED",
          message: "The run expired.",
        },
      },
    };

    expect(planPilotError(error)).toEqual({
      code: "PLANPILOT_RUN_EXPIRED",
      message: "The run expired.",
      details: undefined,
    });
    expect(hasPlanPilotErrorCode(error, "PLANPILOT_RUN_EXPIRED")).toBeTrue();
  });

  it("still accepts the previous flat response body", () => {
    const error = {
      error: {
        code: "SELECTION_CONFLICT",
        message: "Refresh and retry.",
      },
    };

    expect(planPilotError(error).message).toBe("Refresh and retry.");
    expect(hasPlanPilotErrorCode(error, "SELECTION_CONFLICT")).toBeTrue();
  });

  it("keeps a code even when an older response has no message", () => {
    const error = { error: { code: "SELECTION_CONFLICT" } };

    expect(hasPlanPilotErrorCode(error, "SELECTION_CONFLICT")).toBeTrue();
  });

  it("reads errors returned by background jobs", () => {
    const error = {
      code: "PLAN_SPACE_TOO_LARGE",
      message: "slow query",
    };

    expect(hasPlanPilotErrorCode(error, "PLAN_SPACE_TOO_LARGE")).toBeTrue();
  });

  it("uses the concise timeout text for both timeout codes", () => {
    expect(
      planPilotError({
        error: {
          error: {
            code: "PLAN_SPACE_TOO_LARGE",
            message: "Upstream wording.",
          },
        },
      }).message,
    ).toContain("did not finish in time");
  });
});
