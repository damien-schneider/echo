interface ShortcutEditCommands {
  resume: () => Promise<unknown>;
  suspend: () => Promise<unknown>;
}

type ShortcutChange = () => Promise<unknown>;

interface OpenEdit {
  id: string;
  suspended: Promise<unknown>;
}

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
      await resume();
    }
  };

  return {
    abandon: () => close(),
    begin: async (id: string) => {
      if (open?.id === id) {
        return false;
      }
      const left = close();
      const edit = { id, suspended: left.then(suspend) };
      open = edit;
      await edit.suspended;
      return open === edit;
    },
    end: async (id: string, change?: ShortcutChange) => {
      if (open?.id === id) {
        await close(change);
      }
    },
  };
};
