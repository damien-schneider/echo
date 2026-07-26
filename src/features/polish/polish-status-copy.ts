export const polishStatusCopy = {
  downloading: {
    description: "One-time 2.5 GB download. Polish stays offline afterward.",
    title: "Downloading Polish",
  },
  loading: {
    description:
      "Loading 2.5 GB into memory. The first start can take a moment.",
    title: "Loading Polish",
  },
  not_downloaded: {
    action: "Download",
    description:
      "Download the 2.5 GB local proofreading model. It stays offline afterward.",
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
    action: "Repair",
    description: "The local model or runtime could not be prepared.",
    title: "Polish needs repair",
  },
  verifying: {
    description: "Checking the model before it can run.",
    title: "Verifying Polish",
  },
} as const;
