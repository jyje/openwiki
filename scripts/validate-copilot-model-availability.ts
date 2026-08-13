import { appendFile } from "node:fs/promises";
import { getProviderModelOptions } from "../src/config/constants.js";
import { getSelectedModelAvailability } from "../src/model-availability.js";

type CopilotModel = {
  id?: unknown;
  capabilities?: { type?: unknown };
  model_picker_enabled?: unknown;
  policy?: { state?: unknown };
};

type CopilotModelListResponse = {
  data?: CopilotModel[];
};

type AvailabilityStatus = "available" | "unavailable" | "unknown";

const COPILOT_API_BASE_URL = "https://api.githubcopilot.com";
const MISSING_MODEL_ID = "openwiki-ci-model-that-does-not-exist";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function modelId(model: CopilotModel): string | undefined {
  return typeof model.id === "string" ? model.id : undefined;
}

function expectedStatus(model: CopilotModel | undefined): AvailabilityStatus {
  if (!model || model.capabilities?.type !== "chat") {
    return "unavailable";
  }

  if (
    model.policy?.state === "enabled" ||
    (model.policy?.state === undefined && model.model_picker_enabled === true)
  ) {
    return "available";
  }

  if (model.policy?.state === "disabled") {
    return "unavailable";
  }

  return "unknown";
}

async function main(): Promise<void> {
  const apiKey = process.env.COPILOT_API_KEY;
  assert(apiKey, "COPILOT_API_KEY is not configured for this workflow.");

  const response = await fetch(`${COPILOT_API_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  assert(
    response.ok,
    `Copilot Models API returned HTTP ${response.status}. Check whether COPILOT_API_KEY is a valid GitHub OAuth token.`,
  );

  const body = (await response.json()) as CopilotModelListResponse;
  assert(
    Array.isArray(body.data),
    "Copilot Models API returned an unexpected response.",
  );

  const models = body.data;
  const chatModels = models.filter(
    (model) => model.capabilities?.type === "chat" && modelId(model),
  );
  const enabledModels = chatModels.filter(
    (model) => model.policy?.state === "enabled",
  );
  const disabledModels = chatModels.filter(
    (model) => model.policy?.state === "disabled",
  );

  assert(
    enabledModels.length > 0,
    "No policy-enabled Copilot chat model was returned.",
  );
  assert(
    disabledModels.length > 0,
    "No policy-disabled Copilot chat model was returned.",
  );

  const replayFetch: typeof fetch = () => Promise.resolve(Response.json(body));
  const check = (selectedModelId: string) =>
    getSelectedModelAvailability(
      {
        apiKey,
        baseUrl: COPILOT_API_BASE_URL,
        modelId: selectedModelId,
        provider: "copilot",
      },
      replayFetch,
    );

  const enabledModelId = modelId(enabledModels[0]);
  const disabledModelId = modelId(disabledModels[0]);
  assert(enabledModelId, "The enabled Copilot model has no model ID.");
  assert(disabledModelId, "The disabled Copilot model has no model ID.");

  const enabledResult = await check(enabledModelId);
  const disabledResult = await check(disabledModelId);
  const missingResult = await check(MISSING_MODEL_ID);

  assert(
    enabledResult.status === "available",
    `Expected ${enabledModelId} to be available, got ${enabledResult.status}.`,
  );
  assert(
    disabledResult.status === "unavailable",
    `Expected ${disabledModelId} to be unavailable, got ${disabledResult.status}.`,
  );
  assert(
    missingResult.status === "unavailable",
    `Expected the missing model to be unavailable, got ${missingResult.status}.`,
  );

  const modelsById = new Map(
    models.flatMap((model) => {
      const id = modelId(model);
      return id ? ([[id, model]] as const) : [];
    }),
  );
  const presetRows = await Promise.all(
    getProviderModelOptions("copilot").map(async (option) => {
      const model = modelsById.get(option.id);
      const actual = await check(option.id);
      const expected = expectedStatus(model);
      assert(
        actual.status === expected,
        `Preset ${option.id} expected ${expected}, got ${actual.status}.`,
      );

      return {
        model: option.id,
        present: model ? "yes" : "no",
        policy:
          typeof model?.policy?.state === "string"
            ? model.policy.state
            : "not reported",
        result: actual.status,
      };
    }),
  );

  console.log(`Copilot Models API: HTTP ${response.status}`);
  console.log(`Returned models: ${models.length}`);
  console.log(`Chat models: ${chatModels.length}`);
  console.log(`Policy-enabled chat models: ${enabledModels.length}`);
  console.log(`Policy-disabled chat models: ${disabledModels.length}`);
  console.log(`Positive: ${enabledModelId} -> ${enabledResult.status}`);
  console.log(
    `Policy negative: ${disabledModelId} -> ${disabledResult.status}`,
  );
  console.log(
    `Missing negative: ${MISSING_MODEL_ID} -> ${missingResult.status}`,
  );
  console.table(presetRows);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rows = presetRows
      .map(
        (row) =>
          `| \`${row.model}\` | ${row.present} | ${row.policy} | ${row.result} |`,
      )
      .join("\n");
    const summary = [
      "## GitHub Copilot model availability",
      "",
      `- API response: HTTP ${response.status}`,
      `- Returned models: ${models.length}`,
      `- Policy-enabled chat models: ${enabledModels.length}`,
      `- Policy-disabled chat models: ${disabledModels.length}`,
      "",
      "### Coverage",
      "",
      `- Positive: \`${enabledModelId}\` -> \`${enabledResult.status}\``,
      `- Policy negative: \`${disabledModelId}\` -> \`${disabledResult.status}\``,
      `- Missing negative: \`${MISSING_MODEL_ID}\` -> \`${missingResult.status}\``,
      "",
      "### OpenWiki Copilot presets",
      "",
      "| Model | Present | Policy | OpenWiki result |",
      "| --- | --- | --- | --- |",
      rows,
      "",
    ].join("\n");
    await appendFile(summaryPath, summary, "utf8");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Copilot availability validation failed: ${message}`);
  process.exitCode = 1;
});
