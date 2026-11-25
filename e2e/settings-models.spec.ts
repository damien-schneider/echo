import { emitTauriEvent, invokedCommandPayloads, test } from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const POLISH_MODEL_ID = "polish-qwen3-4b-instruct-2507";
const GEMMA_MODEL_ID = "polish-gemma-4-e2b-it";
const POLISH_CATALOG = [
  {
    description: "Balanced everyday language model.",
    download_size_mb: 2497,
    id: POLISH_MODEL_ID,
    languages: {
      at_least: false,
      count: 119,
      includes_dialects: true,
      kind: "count",
      source: "https://qwenlm.github.io/blog/qwen3/",
    },
    memory_mb: 3127,
    name: "Qwen3 4B",
    supports_thinking: false,
    supports_voice_commands: true,
  },
  {
    description: "Compact model with extended reasoning.",
    download_size_mb: 3427,
    id: GEMMA_MODEL_ID,
    languages: {
      at_least: true,
      count: 35,
      includes_dialects: false,
      kind: "count",
      source: "https://huggingface.co/google/gemma-4-E2B-it",
    },
    memory_mb: null,
    name: "Gemma 4 E2B",
    supports_thinking: true,
    supports_voice_commands: false,
  },
  {
    description: "Compact general-purpose model.",
    download_size_mb: 1561,
    id: "polish-minicpm5-2b",
    languages: {
      kind: "listed",
      languages: ["en", "zh"],
      source: "https://huggingface.co/openbmb/MiniCPM5-2B",
    },
    memory_mb: null,
    name: "MiniCPM5-2B",
    supports_thinking: true,
    supports_voice_commands: false,
  },
  {
    description: "Lightweight model for quick replies.",
    download_size_mb: 4823,
    id: "polish-ling-3-0-tiny",
    languages: { kind: "undocumented" },
    memory_mb: null,
    name: "Ling 3.0 Tiny",
    supports_thinking: true,
    supports_voice_commands: false,
  },
];
const FILE_ACTION_NAME = /Delete|Show/;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    let legacyFilesMb: number | null = 2340;
    state.respond = (command, args) => {
      const answer = respond(command, args);
      if (command === "get_legacy_model_files_mb") {
        return legacyFilesMb;
      }
      if (command === "delete_legacy_model_files") {
        legacyFilesMb = null;
      }
      if (command === "get_transcription_profiles") {
        return [
          {
            description: "Fastest multilingual transcription.",
            download_size_mb: 190,
            is_active: true,
            is_downloaded: true,
            is_downloading: false,
            is_recommended: false,
            label: "Small",
            memory_mb: 469,
            partial_download_mb: null,
            size: "small",
          },
          {
            description: "Best balance of accuracy and speed.",
            download_size_mb: 574,
            is_active: false,
            is_downloaded: false,
            is_downloading: false,
            is_recommended: true,
            label: "Medium",
            memory_mb: 857,
            partial_download_mb: null,
            size: "medium",
          },
          {
            description: "Highest multilingual accuracy.",
            download_size_mb: 1080,
            is_active: false,
            is_downloaded: false,
            is_downloading: false,
            is_recommended: false,
            label: "Large",
            memory_mb: 1651,
            partial_download_mb: 472,
            size: "large",
          },
        ];
      }
      if (command === "get_transcription_model_status") {
        return "small";
      }
      return answer;
    };
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ catalog, defaultModelId, candidateModelId }) => {
      const state = window.__ECHO_TEST_STATE__;
      const respond = state.respond;
      const query = new URLSearchParams(window.location.search);
      const installed = new Set(
        state.polishStatus === "not_downloaded" ? [] : [defaultModelId]
      );
      if (query.has("installedCandidate")) {
        installed.add(candidateModelId);
      }
      const partials = new Map(
        query.has("partialCandidate") ? [[candidateModelId, 721]] : []
      );
      let activeModelId = defaultModelId;
      let selectingModelId = query.has("pendingCandidate")
        ? candidateModelId
        : null;
      let downloading = selectingModelId !== null;
      let selection: PromiseWithResolvers<void> | undefined;
      let deletion: PromiseWithResolvers<void> | undefined;
      let statusBeforeSwitch = state.polishStatus;
      const invalidateCatalog = () =>
        window.__ECHO_TEST__.emit("polish-models-changed", null);
      const publishPolishStatus = (nextState: string) => {
        state.polishStatus = nextState;
        window.__ECHO_TEST__.emit(
          "polish-status-changed",
          state.respond("get_polish_status")
        );
      };
      const loadCandidate = () => {
        statusBeforeSwitch = state.polishStatus;
        publishPolishStatus("loading");
      };

      state.respond = (command, args) => {
        const modelId =
          args && typeof args === "object" && "modelId" in args
            ? args.modelId
            : undefined;
        const answer = respond(command, args);
        switch (command) {
          case "get_polish_status": {
            const model = catalog.find(({ id }) => id === activeModelId);
            if (!model) {
              throw new Error("The active model is missing");
            }
            return {
              message: state.polishStatus,
              model: {
                download_size_mb: model.download_size_mb,
                id: model.id,
                name: model.name,
                supports_thinking: model.supports_thinking,
                supports_voice_commands: model.supports_voice_commands,
              },
              state: state.polishStatus,
            };
          }
          case "get_polish_models":
            return {
              models: catalog.map((model) => ({
                ...model,
                is_active: model.id === activeModelId,
                is_downloaded: installed.has(model.id),
                is_downloading: downloading && model.id === selectingModelId,
                partial_download_mb: partials.get(model.id) ?? null,
              })),
              selecting_model_id: selectingModelId,
            };
          case "select_polish_model":
            if (typeof modelId !== "string") {
              throw new Error("Missing model ID");
            }
            selectingModelId = modelId;
            downloading = !installed.has(modelId);
            selection = Promise.withResolvers<void>();
            invalidateCatalog();
            if (!downloading) {
              loadCandidate();
            }
            return selection.promise;
          case "delete_model":
            if (query.has("failDeletion")) {
              deletion = Promise.withResolvers<void>();
              return deletion.promise;
            }
            if (typeof modelId === "string") {
              installed.delete(modelId);
              partials.delete(modelId);
              if (modelId === activeModelId) {
                state.polishStatus = "not_downloaded";
              }
              invalidateCatalog();
            }
            return answer;
          case "test:fail-deletion":
            deletion?.reject(args);
            return null;
          case "test:complete-polish-download":
            if (selectingModelId) {
              installed.add(selectingModelId);
              partials.delete(selectingModelId);
              downloading = false;
              window.__ECHO_TEST__.emit(
                "model-download-complete",
                selectingModelId
              );
              loadCandidate();
            }
            return null;
          case "test:finish-polish-selection":
            if (selectingModelId) {
              if (typeof args === "string") {
                publishPolishStatus(statusBeforeSwitch);
                selection?.reject(args);
              } else {
                activeModelId = selectingModelId;
                publishPolishStatus("ready");
                selection?.resolve();
              }
              selectingModelId = null;
              downloading = false;
              invalidateCatalog();
            }
            return null;
          default:
            return answer;
        }
      };
    },
    {
      candidateModelId: GEMMA_MODEL_ID,
      catalog: POLISH_CATALOG,
      defaultModelId: POLISH_MODEL_ID,
    }
  );
});

const openModels = async (page: Page, query = "polish=ready") => {
  await page.goto(`/?accessibility=granted&${query}`);
  await page.getByRole("button", { name: "Models", exact: true }).click();
};

test("every model states the disk space and memory it takes", async ({
  page,
}) => {
  await openModels(page);
  const footprints = {
    Large: "Disk 1.1 GB · RAM ~1.7 GB",
    Medium: "Disk 574 MB · RAM ~857 MB",
    "Qwen3 4B": "Disk 2.5 GB · RAM ~3.1 GB",
    Small: "Disk 190 MB · RAM ~469 MB",
  };
  for (const [name, footprint] of Object.entries(footprints)) {
    await expect(
      page.getByRole("article", { name, exact: true })
    ).toContainText(footprint);
  }
});

test("each language model states its documented languages and links the source", async ({
  page,
}) => {
  await openModels(page);
  const minicpm = page.getByRole("article", { name: "MiniCPM5-2B" });
  await expect(
    page.getByRole("article", { name: "Ling 3.0 Tiny" })
  ).toContainText("Languages not documented");

  await minicpm
    .getByRole("link", { name: "Documented for English and Chinese" })
    .click();
  await expect
    .poll(() => invokedCommandPayloads(page, "plugin:opener|open_url"))
    .toEqual([
      JSON.stringify({ url: "https://huggingface.co/openbmb/MiniCPM5-2B" }),
    ]);
  await expect(minicpm).toBeVisible();
});

test("the active transcription model can be shown in Finder and deleted", async ({
  page,
}) => {
  await openModels(page);
  const small = page.getByRole("article", { name: "Small", exact: true });

  await small.getByRole("button", { name: "Show Small in Finder" }).click();
  await expect
    .poll(() => invokedCommandPayloads(page, "reveal_model_file"))
    .toEqual(['{"modelId":"small"}']);

  await small.getByRole("button", { name: "Delete Small" }).click();
  expect(await invokedCommandPayloads(page, "delete_model")).toEqual([]);
  await small
    .getByRole("button", { name: "Delete Small: click again to confirm" })
    .click();
  await expect
    .poll(() => invokedCommandPayloads(page, "delete_model"))
    .toEqual(['{"modelId":"small"}']);
});

test("a model that is not downloaded offers no file actions", async ({
  page,
}) => {
  await openModels(page);
  const medium = page.getByRole("article", { name: "Medium", exact: true });
  await expect(
    medium.getByRole("button", { name: "Download", exact: true })
  ).toBeVisible();
  await expect(
    medium.getByRole("button", { name: FILE_ACTION_NAME })
  ).toHaveCount(0);
});

test("an interrupted download shows how far it got and resumes it", async ({
  page,
}) => {
  await openModels(page);
  const large = page.getByRole("article", { name: "Large", exact: true });
  await expect(large).toContainText("472 MB of 1.1 GB downloaded");

  await large.getByRole("button", { name: "Resume", exact: true }).click();

  await expect
    .poll(() => invokedCommandPayloads(page, "select_transcription_model_size"))
    .toEqual(['{"size":"large"}']);
});

test("deleting Qwen3 4B offers its download again", async ({ page }) => {
  await openModels(page);
  const qwen = page.getByRole("article", { name: "Qwen3 4B", exact: true });

  await qwen.getByRole("button", { name: "Delete Qwen3 4B" }).click();
  await qwen
    .getByRole("button", { name: "Delete Qwen3 4B: click again to confirm" })
    .click();

  await expect
    .poll(() => invokedCommandPayloads(page, "delete_model"))
    .toEqual([`{"modelId":"${POLISH_MODEL_ID}"}`]);
  await expect(
    qwen.getByRole("button", { name: "Download", exact: true })
  ).toBeVisible();
});

test("opens the language catalog without downloading or selecting a model", async ({
  page,
}) => {
  await openModels(page, "polish=not_downloaded");

  for (const model of POLISH_CATALOG) {
    const row = page.getByRole("article", { name: model.name, exact: true });
    await expect(
      row.getByRole("button", { name: "Download", exact: true })
    ).toBeEnabled();
    await expect(
      row.getByRole("button", { name: FILE_ACTION_NAME })
    ).toHaveCount(0);
  }
  const gemma = page.getByRole("article", { name: "Gemma 4 E2B" });
  await expect(gemma).toContainText("Disk 3.4 GB");
  await expect(gemma).not.toContainText("RAM");
  await expect(
    page.getByRole("article", { name: "Qwen3 4B" })
  ).not.toContainText("Active");
  expect(await invokedCommandPayloads(page, "select_polish_model")).toEqual([]);
  expect(await invokedCommandPayloads(page, "download_polish_model")).toEqual(
    []
  );
});

test("resumes a candidate and keeps the active model until activation finishes", async ({
  page,
}) => {
  await openModels(page, "polish=ready&partialCandidate");
  const previous = page.getByRole("article", { name: "Qwen3 4B" });
  const candidate = page.getByRole("article", { name: "Gemma 4 E2B" });
  await expect(candidate).toContainText("721 MB of 3.4 GB downloaded");
  await expect(
    candidate.getByRole("button", { name: "Delete Gemma 4 E2B" })
  ).toBeEnabled();
  await candidate
    .getByRole("button", { name: "Show Gemma 4 E2B in Finder" })
    .click();
  expect(await invokedCommandPayloads(page, "reveal_model_file")).toEqual([
    `{"modelId":"${GEMMA_MODEL_ID}"}`,
  ]);
  await candidate.getByRole("button", { name: "Resume", exact: true }).click();

  await expect
    .poll(() => invokedCommandPayloads(page, "select_polish_model"))
    .toEqual([`{"modelId":"${GEMMA_MODEL_ID}"}`]);
  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 1_028_100_000,
    model_id: GEMMA_MODEL_ID,
    percentage: 30,
    total: 3_427_000_000,
  });
  await expect(candidate.getByText("30%", { exact: true })).toBeVisible();
  await expect(previous).toContainText("Active");
  await expect(previous.getByRole("progressbar")).toHaveCount(0);
  await expect(
    previous.getByRole("button", { name: "Delete Qwen3 4B" })
  ).toBeDisabled();

  await emitTauriEvent(page, "model-verification-started", GEMMA_MODEL_ID);
  await expect(candidate).toContainText("Verifying model files…");
  await expect(previous).toContainText("Active");

  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond("test:complete-polish-download")
  );
  await expect(candidate).toContainText("Checking and loading…");
  await expect(previous).not.toContainText("Checking and loading…");
  await expect(previous).toContainText("Active");
  await expect(candidate).not.toContainText("Active");

  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond("test:finish-polish-selection")
  );
  await expect(candidate).toContainText("Active");
  await expect(
    previous.getByRole("button", { name: "Use", exact: true })
  ).toBeEnabled();
  await expect(previous).not.toContainText("Active");
});

test("switching away from Qwen pauses voice commands without changing the preference", async ({
  page,
}) => {
  await openModels(page, "polish=ready&installedCandidate");
  const models = page.getByRole("button", { name: "Models", exact: true });
  const prompts = page.getByRole("button", { name: "Prompts", exact: true });
  const commands = page.getByRole("switch", { name: "Voice commands" });

  await prompts.click();
  await expect(commands).toBeEnabled();
  await expect(commands).toBeChecked();
  await models.click();
  await page
    .getByRole("article", { name: "Gemma 4 E2B" })
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond("test:finish-polish-selection")
  );
  await prompts.click();
  await expect(commands).toHaveCount(0);
  await expect(
    page.getByText("Select Qwen3 4B in Models to use voice commands.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Open Models", exact: true }).click();
  await expect
    .poll(() => invokedCommandPayloads(page, "plugin:event|emit"))
    .toContainEqual(expect.stringContaining('"open-settings-section"'));

  await models.click();
  await page
    .getByRole("article", { name: "Qwen3 4B" })
    .getByRole("button", { name: "Use", exact: true })
    .click();
  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond("test:finish-polish-selection")
  );
  await prompts.click();
  await expect(commands).toBeEnabled();
  await expect(commands).toBeChecked();
  expect(
    await invokedCommandPayloads(page, "change_voice_commands_setting")
  ).toEqual([]);
});

test("deletes an interrupted candidate without deleting the active model", async ({
  page,
}) => {
  await openModels(page, "polish=ready&partialCandidate");
  const candidate = page.getByRole("article", { name: "Gemma 4 E2B" });
  await candidate.getByRole("button", { name: "Delete Gemma 4 E2B" }).click();
  await candidate
    .getByRole("button", { name: "Delete Gemma 4 E2B: click again to confirm" })
    .click();
  await expect
    .poll(() => invokedCommandPayloads(page, "delete_model"))
    .toEqual([`{"modelId":"${GEMMA_MODEL_ID}"}`]);
  await expect(
    candidate.getByRole("button", { name: "Download", exact: true })
  ).toBeEnabled();
  await expect(
    candidate.getByRole("button", { name: FILE_ACTION_NAME })
  ).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Qwen3 4B" })).toContainText(
    "Active"
  );
});

test("restores the pending candidate without fabricating download progress", async ({
  page,
}) => {
  await openModels(page, "polish=ready&pendingCandidate");
  const candidate = page.getByRole("article", { name: "Gemma 4 E2B" });
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await page.getByRole("button", { name: "Models", exact: true }).click();
  await expect(
    candidate.getByRole("button", { name: "Downloading" })
  ).toBeDisabled();
  await expect(candidate.getByRole("progressbar")).toHaveCount(0);
  await emitTauriEvent(page, "model-download-progress", {
    downloaded: 1_713_500_000,
    model_id: GEMMA_MODEL_ID,
    percentage: 50,
    total: 3_427_000_000,
  });
  await expect(candidate.getByText("50%", { exact: true })).toBeVisible();
  expect(await invokedCommandPayloads(page, "select_polish_model")).toEqual([]);
});

test("reports a failed switch on its candidate and leaves the active model ready", async ({
  page,
}) => {
  await openModels(page, "polish=ready&installedCandidate");
  const previous = page.getByRole("article", { name: "Qwen3 4B" });
  const candidate = page.getByRole("article", { name: "Gemma 4 E2B" });
  await candidate.getByRole("button", { name: "Use", exact: true }).click();
  await expect(
    candidate.getByRole("heading", { name: "Gemma 4 E2B" })
  ).toBeFocused();
  await expect(candidate).toContainText("Checking and loading…");
  await expect(previous).not.toContainText("Checking and loading…");
  await expect(previous).toContainText("Active");

  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond(
      "test:finish-polish-selection",
      "Couldn't load this model. The previous model is still active."
    )
  );
  await expect(
    candidate.getByText(
      "Couldn't load this model. The previous model is still active.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    candidate.getByRole("button", { name: "Use", exact: true })
  ).toBeEnabled();
  await expect(previous).toContainText("Active");
  await expect(previous.getByRole("button", { name: "Repair" })).toHaveCount(0);
  await expect(
    previous.getByRole("button", { name: "Delete Qwen3 4B" })
  ).toBeEnabled();
});

test("repairs the active Qwen model from its row", async ({ page }) => {
  await openModels(page, "polish=repair");
  const qwen = page.getByRole("article", { name: "Qwen3 4B", exact: true });
  await qwen.getByRole("button", { name: "Repair", exact: true }).click();
  await expect
    .poll(() => invokedCommandPayloads(page, "repair_polish_model"))
    .toHaveLength(1);
});

test("a failed deletion is reported on the model it concerns", async ({
  page,
}) => {
  await openModels(page, "polish=ready&failDeletion");
  const qwen = page.getByRole("article", { name: "Qwen3 4B", exact: true });

  await qwen.getByRole("button", { name: "Delete Qwen3 4B" }).click();
  await qwen
    .getByRole("button", { name: "Delete Qwen3 4B: click again to confirm" })
    .click();
  await expect(qwen).toContainText("Deleting…");

  await page.evaluate(() =>
    window.__ECHO_TEST_STATE__.respond(
      "test:fail-deletion",
      "Wait for the current language model operation to finish."
    )
  );
  await expect(qwen.getByRole("alert")).toHaveText(
    "Wait for the current language model operation to finish."
  );
  await expect(
    qwen.getByRole("button", { name: "Delete Qwen3 4B" })
  ).toBeVisible();
});

test("meeting models state their size and download from Models", async ({
  page,
}) => {
  await openModels(page);
  const voxtral = page.getByRole("article", { name: "Voxtral Realtime" });
  const speakers = page.getByRole("article", { name: "Speaker detection" });
  await expect(voxtral).toContainText("Disk 2.8 GB");
  await expect(speakers).toContainText("Disk 470 MB");

  await voxtral.getByRole("button", { name: "Download", exact: true }).click();
  await expect
    .poll(() => invokedCommandPayloads(page, "download_meeting_model"))
    .toHaveLength(1);

  await speakers
    .getByRole("button", { name: "Delete Speaker detection" })
    .click();
  await speakers
    .getByRole("button", {
      name: "Delete Speaker detection: click again to confirm",
    })
    .click();
  await expect
    .poll(() => invokedCommandPayloads(page, "delete_model"))
    .toEqual(['{"modelId":"diarization-sortformer"}']);
});

test("Voxtral says why this Mac cannot run it instead of offering it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    state.respond = (command, args) =>
      command === "get_meeting_model_status"
        ? {
            download_size_mb: 2831,
            downloaded: false,
            downloading: false,
            partial_download_mb: null,
            supported: false,
          }
        : respond(command, args);
  });
  await openModels(page);
  const voxtral = page.getByRole("article", { name: "Voxtral Realtime" });

  await expect(voxtral).toContainText(
    "Needs an Apple Silicon Mac with 16 GB of memory."
  );
  await expect(voxtral.getByRole("button")).toHaveCount(0);
});

test("files from older versions state their size and go once deleted", async ({
  page,
}) => {
  await openModels(page);
  const legacy = page.getByRole("article", {
    name: "Files from older versions",
  });
  await expect(legacy).toContainText("Disk 2.3 GB");

  await legacy
    .getByRole("button", { name: "Delete Files from older versions" })
    .click();
  await legacy
    .getByRole("button", {
      name: "Delete Files from older versions: click again to confirm",
    })
    .click();

  await expect(legacy).toHaveCount(0);
  expect(
    await invokedCommandPayloads(page, "delete_legacy_model_files")
  ).toHaveLength(1);
});
