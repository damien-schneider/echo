import { invokedCommandPayloads, test } from "@e2e/fixtures";
import { expectSkinContrast } from "@e2e/skin-contrast";
import { expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    state.respond = (command, args) => {
      if (command === "get_microphone_permission_status") {
        return "authorized";
      }
      if (command === "plugin:store|get") {
        return [
          {
            audio_feedback: true,
            audio_feedback_volume: 1,
            start_hidden: false,
            push_to_talk: true,
            bindings: {
              transcribe: {
                id: "transcribe",
                name: "Transcribe",
                description: "Converts your speech into text.",
                default_binding: "Alt+Space",
                current_binding: "Alt+Space",
              },
              polish: {
                id: "polish",
                name: "Polish",
                description: "Fix spelling and grammar in selected text.",
                default_binding: "Alt+Shift+Space",
                current_binding: "Alt+Shift+Space",
              },
            },
          },
          true,
        ];
      }
      return respond(command, args);
    };
  });
});

test("settings controls have labels and save keyboard changes", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  await expect(
    page.getByRole("switch", { name: "Recording sounds", exact: true })
  ).toBeChecked();
  const startHidden = page.getByRole("switch", {
    name: "Start hidden",
    exact: true,
  });
  await expect(startHidden).toBeVisible();
  await startHidden.focus();
  await page.keyboard.press("Space");
  await expect(startHidden).toBeChecked();
  expect(
    await invokedCommandPayloads(page, "change_start_hidden_setting")
  ).toContain('{"enabled":true}');

  const volume = page.getByRole("slider", { name: "Volume", exact: true });
  await volume.focus();
  await page.keyboard.press("Home");
  await expect(volume).toHaveAttribute("aria-valuenow", "0");
  expect(
    await invokedCommandPayloads(page, "change_audio_feedback_volume_setting")
  ).toContain('{"volume":0}');
});

test("failed setting saves roll back the switch", async ({ page }) => {
  await page.goto("/?accessibility=granted&reject=change_start_hidden_setting");
  const startHidden = page.getByRole("switch", {
    name: "Start hidden",
    exact: true,
  });
  await startHidden.click();
  await expect(startHidden).not.toBeChecked();
});

test("select portals retain the Echo skin and close back to their trigger", async ({
  page,
}) => {
  await page.goto("/?accessibility=granted");
  const microphone = page.getByRole("combobox", {
    name: "Microphone",
    exact: true,
  });
  await microphone.focus();
  await page.keyboard.press("Space");
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  await expect(
    options.locator("xpath=ancestor-or-self::*[@data-skin='echo']").first()
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(microphone).toBeFocused();
});

test("selecting a saved prompt loads its text into the editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    state.respond = (command, args) => {
      if (command === "plugin:store|get") {
        return [
          {
            audio_feedback: true,
            bindings: {},
            post_process_enabled: true,
            post_process_selected_prompt_id: "prompt-1",
            post_process_prompts: [
              {
                id: "prompt-1",
                name: "Concise",
                prompt: "Keep this concise: @output",
              },
              {
                id: "prompt-2",
                name: "Formal",
                prompt: "Use a formal tone: @output",
              },
            ],
          },
          true,
        ];
      }
      return respond(command, args);
    };
  });
  await page.goto("/?accessibility=granted");
  await page
    .getByRole("button", { name: "Post-processing", exact: true })
    .click();
  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toContainText("Keep this concise:");
  const prompt = page.getByRole("combobox", {
    name: "Saved prompt",
    exact: true,
  });
  await prompt.click();
  await page.getByRole("option", { name: "Formal", exact: true }).click();
  await expect(editor).toContainText("Use a formal tone:");
});

test("Echo settings remain readable in light and dark modes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?accessibility=granted");
  await expect(
    page.getByRole("switch", { name: "Start hidden", exact: true })
  ).toBeVisible();
  for (const mode of ["Light", "Dark"]) {
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page.getByRole("menuitemradio", { name: mode, exact: true }).click();
    await expect(page.getByRole("menu")).not.toBeVisible();
    await expectSkinContrast(page);
    await page.screenshot({
      path: testInfo.outputPath(`settings-${mode.toLowerCase()}.png`),
    });
    await page.setViewportSize({ width: 900, height: 680 });
    await page.screenshot({
      path: testInfo.outputPath(`settings-${mode.toLowerCase()}-desktop.png`),
    });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test("settings fit a narrow app window with reduced motion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?accessibility=granted");
  await expect(
    page.getByRole("switch", { name: "Start hidden", exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--duration-base")
        .trim()
    )
  ).toBe("0ms");
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .locator('[data-control-ui="scroll-area"][data-slot="viewport"]')
        .evaluateAll((viewports) =>
          viewports.every(
            (viewport) => viewport.scrollWidth <= viewport.clientWidth
          )
        )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`settings-${width}.png`),
    });
  }
});

test("provider fields discard drafts when the selected provider changes", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const state = window.__ECHO_TEST_STATE__;
    const respond = state.respond;
    let selectedProviderId = "custom";
    state.respond = (command, args) => {
      if (
        command === "set_post_process_provider" &&
        typeof args === "object" &&
        args !== null &&
        "providerId" in args &&
        typeof args.providerId === "string"
      ) {
        selectedProviderId = args.providerId;
      }
      if (command === "plugin:store|get") {
        return [
          {
            bindings: {},
            post_process_enabled: true,
            post_process_provider_id: selectedProviderId,
            post_process_providers: [
              {
                id: "custom",
                label: "Custom",
                base_url: "http://localhost:8080/v1",
                allow_base_url_edit: true,
              },
              {
                id: "openai",
                label: "OpenAI",
                base_url: "https://api.openai.com/v1",
                allow_base_url_edit: false,
              },
            ],
            post_process_api_keys: {
              custom: "custom-key",
              openai: "openai-key",
            },
          },
          true,
        ];
      }
      return respond(command, args);
    };
  });
  await page.goto("/?accessibility=granted");
  await page
    .getByRole("button", { name: "Post-processing", exact: true })
    .click();
  await expect(page.getByLabel("Base URL", { exact: true })).toHaveValue(
    "http://localhost:8080/v1"
  );
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "custom-key"
  );
  await page.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: "OpenAI", exact: true }).click();
  await expect(page.getByLabel("Base URL", { exact: true })).toHaveValue(
    "https://api.openai.com/v1"
  );
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "openai-key"
  );
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("provider-settings.png") });
});
