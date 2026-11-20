import { describe, expect, it } from "bun:test";
import { createShortcutEditSession } from "@/components/settings/shortcut-edit-session";

const shortcuts = () => {
  const state = { live: true };
  const session = createShortcutEditSession({
    resume: () => {
      state.live = true;
      return Promise.resolve();
    },
    suspend: () => {
      state.live = false;
      return Promise.resolve();
    },
  });
  return { session, state };
};

describe("shortcut edit session", () => {
  it("turns shortcuts off while a row is being edited", async () => {
    const { session, state } = shortcuts();

    expect(await session.begin("transcribe")).toBe(true);

    expect(state.live).toBe(false);
  });

  it("keeps shortcuts off when the user starts editing another row", async () => {
    const { session, state } = shortcuts();
    await session.begin("transcribe");

    expect(await session.begin("polish")).toBe(true);

    expect(state.live).toBe(false);
  });

  it("keeps the newly clicked row in edit when the row left behind is cancelled afterwards", async () => {
    const { session, state } = shortcuts();
    await session.begin("transcribe");
    const opening = session.begin("polish");

    await session.end("transcribe");

    expect(await opening).toBe(true);
    expect(state.live).toBe(false);
  });

  it("brings shortcuts back when the edit is abandoned", async () => {
    const { session, state } = shortcuts();
    await session.begin("transcribe");

    await session.abandon();

    expect(state.live).toBe(true);
  });

  it("brings shortcuts back when the edit was abandoned before suspension landed", async () => {
    const landing = Promise.withResolvers<void>();
    const state = { live: true };
    const session = createShortcutEditSession({
      resume: () => {
        state.live = true;
        return Promise.resolve();
      },
      suspend: async () => {
        await landing.promise;
        state.live = false;
      },
    });

    const opening = session.begin("transcribe");
    const leaving = session.abandon();
    landing.resolve();

    expect(await opening).toBe(false);
    await leaving;
    expect(state.live).toBe(true);
  });

  it("applies a new combo while shortcuts are still off, then brings them back", async () => {
    const { session, state } = shortcuts();
    await session.begin("transcribe");
    let liveDuringChange = true;

    await session.end("transcribe", () => {
      liveDuringChange = state.live;
      return Promise.resolve();
    });

    expect(liveDuringChange).toBe(false);
    expect(state.live).toBe(true);
  });

  it("applies a new combo once when the edit is ended twice", async () => {
    const { session } = shortcuts();
    await session.begin("transcribe");
    let applied = 0;
    const change = () => {
      applied += 1;
      return Promise.resolve();
    };

    await Promise.all([
      session.end("transcribe", change),
      session.end("transcribe", change),
    ]);

    expect(applied).toBe(1);
  });

  it("brings shortcuts back even when the new combo cannot be applied", async () => {
    const { session, state } = shortcuts();
    await session.begin("transcribe");

    const ending = session.end("transcribe", () =>
      Promise.reject(new Error("refused"))
    );

    await expect(ending).rejects.toThrow("refused");
    expect(state.live).toBe(true);
  });
});
