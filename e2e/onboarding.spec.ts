import { emitTauriEvent, test, waitForTauriListener } from "@e2e/fixtures";
import { expect } from "@playwright/test";

const SMALL_DOWNLOADED_FLAG = "echoSmallDownloaded";

test("a model downloaded from the notch prompt ends onboarding", async ({
  page,
}) => {
  await page.addInitScript((flag) => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    const isSmallDownloaded = () => Reflect.get(window, flag) === true;
    state.respond = (command, args) => {
      if (command === "has_any_models_available") {
        return isSmallDownloaded();
      }
      if (command === "get_transcription_profiles") {
        return [
          {
            description: "Fastest multilingual transcription.",
            download_size_mb: 190,
            is_active: true,
            is_downloaded: isSmallDownloaded(),
            is_downloading: false,
            is_recommended: false,
            label: "Small",
            memory_mb: 469,
            partial_download_mb: null,
            size: "small",
          },
        ];
      }
      return respond(command, args);
    };
  }, SMALL_DOWNLOADED_FLAG);
  await page.goto("/?accessibility=granted");
  await expect(
    page.getByText(
      "Choose how much local transcription quality this computer should use."
    )
  ).toBeVisible();
  await waitForTauriListener(page, "model-download-complete");

  await page.evaluate(
    (flag) => Reflect.set(window, flag, true),
    SMALL_DOWNLOADED_FLAG
  );
  await emitTauriEvent(page, "model-download-complete", "small");

  await expect(
    page.getByRole("button", { name: "Models", exact: true })
  ).toBeVisible();
});
