// Must match src-tauri/src/settings.rs.
export const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1",
  custom: "http://localhost:8080/v1",
  ollama: "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export const getDefaultBaseUrl = (providerId: string): string | undefined =>
  DEFAULT_PROVIDER_BASE_URLS[providerId];
