interface ShortcutEditCommands {
  resume: (id: string) => Promise<unknown>;
  suspend: (id: string) => Promise<unknown>;
}

type ShortcutChange = () => Promise<unknown>;

interface OpenEdit {
  id: string;
  suspended: Promise<unknown>;
}

// a suspended shortcut stays dead until resumed, so every way out of an edit goes through close
export const createShortcutEditSession = ({
  resume,
  suspend,
}: ShortcutEditCommands) => {
  let open: OpenEdit | null = null;

  const close = async (change?: ShortcutChange) => {
    const closing = open;
    if (!closing) {
      return;
    }
    open = null;
    try {
      await closing.suspended;
      await change?.();
    } finally {
      await resume(closing.id);
    }
  };

  return {
    abandon: () => close(),
    begin: async (id: string) => {
      if (open?.id === id) {
        return false;
      }
      const left = close();
      const edit = { id, suspended: suspend(id) };
      open = edit;
      await Promise.all([left, edit.suspended]);
      return open === edit;
    },
    end: async (id: string, change?: ShortcutChange) => {
      if (open?.id === id) {
        await close(change);
      }
    },
  };
};
