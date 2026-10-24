import { invokedCommandPayloads, test } from "@e2e/fixtures";
import { expect, type Page } from "@playwright/test";

const POLISH_MODEL_ID = "polish-qwen3-4b-instruct-2507";
const FILE_ACTION_NAME = /Delete|Show/;

test.beforeEach(async ({ page }) => {
  await page.addInitScript((polishModelId) => {
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
      if (command === "get_polish_model_footprint") {
        return { download_size_mb: 2497, memory_mb: 3127 };
      }
      if (command === "get_transcription_model_status") {
        return "small";
      }
      if (
        command === "delete_model" &&
        typeof args === "object" &&
        args !== null &&
        "modelId" in args &&
        args.modelId === polishModelId
      ) {
        state.polishStatus = "not_downloaded";
      }
      return answer;
    };
  }, POLISH_MODEL_ID);
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

test("a failed deletion is reported on the model it concerns", async ({
  page,
}) => {
  await openModels(page, "polish=ready&reject=delete_model");
  const qwen = page.getByRole("article", { name: "Qwen3 4B", exact: true });

  await qwen.getByRole("button", { name: "Delete Qwen3 4B" }).click();
  await qwen
    .getByRole("button", { name: "Delete Qwen3 4B: click again to confirm" })
    .click();

  await expect(qwen.getByRole("alert")).toContainText("Rejected delete_model");
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
