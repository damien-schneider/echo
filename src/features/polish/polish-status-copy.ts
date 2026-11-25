export const polishStatusCopy = {
  downloading: {
    description: "Polish runs offline when the download is complete.",
    title: "Downloading Polish",
  },
  loading: {
    description: "The first start can take a moment.",
    title: "Loading Polish",
  },
  not_downloaded: {
    description: "Polish checks your selected text on this computer.",
    title: "Polish",
  },
  preparing: {
    description: "Checking the private local proofreading model.",
    title: "Preparing Polish",
  },
  ready: {
    description: "Select text and press Option/Alt+1 to proofread locally.",
    title: "Polish ready",
  },
  repair: {
    description: "The local model or runtime could not be prepared.",
    title: "Polish needs repair",
  },
  verifying: {
    description: "Checking the model before it can run.",
    title: "Verifying Polish",
  },
} as const;
