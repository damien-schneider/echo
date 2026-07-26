import { describe, expect, test } from "bun:test";
import { polishStatusCopy } from "@/features/polish/polish-status-copy";

describe("polishStatusCopy", () => {
  test("asks for an explicit download before preparing Polish", () => {
    expect(polishStatusCopy.not_downloaded.title).toBe("Polish");
    expect(polishStatusCopy.not_downloaded.action).toBe("Download");
  });

  test("covers download, verification, loading, ready, and repair states", () => {
    expect(polishStatusCopy.downloading.title).toBe("Downloading Polish");
    expect(polishStatusCopy.verifying.title).toBe("Verifying Polish");
    expect(polishStatusCopy.loading.title).toBe("Loading Polish");
    expect(polishStatusCopy.ready.title).toBe("Polish ready");
    expect(polishStatusCopy.repair.action).toBe("Repair");
  });

  test("explains the indeterminate memory-loading phase honestly", () => {
    expect(polishStatusCopy.loading.description).toBe(
      "Loading 2.5 GB into memory. The first start can take a moment."
    );
  });
});
