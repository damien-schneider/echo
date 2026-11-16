import { describe, expect, it } from "bun:test";
import { createShortcutEditSession } from "@/components/settings/shortcut-edit-session";

const shortcuts = () => {
  const suspended = new Set<string>();
  const session = createShortcutEditSession({
    resume: (id) => {
      suspended.delete(id);
      return Promise.resolve();
    },
    suspend: (id) => {
      suspended.add(id);
      return Promise.resolve();
    },
  });
  return { session, suspended };
};

describe("shortcut edit session", () => {
  it("suspends the shortcut while its row is being edited", async () => {
    const { session, suspended } = shortcuts();

    expect(await session.begin("transcribe")).toBe(true);

    expect([...suspended]).toEqual(["transcribe"]);
  });

  it("brings the first shortcut back when the user starts editing another row", async () => {
    const { session, suspended } = shortcuts();
    await session.begin("transcribe");

    expect(await session.begin("polish")).toBe(true);

    expect([...suspended]).toEqual(["polish"]);
  });

  it("keeps the newly clicked row in edit when the row left behind is cancelled afterwards", async () => {
    const { session, suspended } = shortcuts();
    await session.begin("transcribe");
    const opening = session.begin("polish");

    await session.end("transcribe");

    expect(await opening).toBe(true);
    expect([...suspended]).toEqual(["polish"]);
  });

  it("brings the shortcut back when the edit is abandoned", async () => {
    const { session, suspended } = shortcuts();
    await session.begin("transcribe");

    await session.abandon();

    expect([...suspended]).toEqual([]);
  });

  it("brings back a shortcut whose edit was abandoned before its suspension landed", async () => {
    const landing = Promise.withResolvers<void>();
    const suspended = new Set<string>();
    const session = createShortcutEditSession({
      resume: (id) => {
        suspended.delete(id);
        return Promise.resolve();
      },
      suspend: async (id) => {
        await landing.promise;
        suspended.add(id);
      },
    });

    const opening = session.begin("transcribe");
    const leaving = session.abandon();
    landing.resolve();

    expect(await opening).toBe(false);
    await leaving;
    expect([...suspended]).toEqual([]);
  });

  it("applies a new combo while the shortcut is still suspended, then brings it back", async () => {
    const { session, suspended } = shortcuts();
    await session.begin("transcribe");
    let suspendedDuringChange: string[] = [];

    await session.end("transcribe", () => {
      suspendedDuringChange = [...suspended];
      return Promise.resolve();
    });

    expect(suspendedDuringChange).toEqual(["transcribe"]);
    expect([...suspended]).toEqual([]);
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

  it("brings the shortcut back even when the new combo cannot be applied", async () => {
    const { session, suspended } = shortcuts();
    await session.begin("transcribe");

    const ending = session.end("transcribe", () =>
      Promise.reject(new Error("refused"))
    );

    await expect(ending).rejects.toThrow("refused");
    expect([...suspended]).toEqual([]);
  });
});
