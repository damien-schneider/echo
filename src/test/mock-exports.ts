import { mock } from "bun:test";

// Bun module mocks are process-wide: dropping the real exports breaks later test files that import them.
export const mockExports = async (
  specifier: string,
  overrides: Record<string, unknown>
) => {
  const realExports = { ...(await import(specifier)) };
  mock.module(specifier, () => ({ ...realExports, ...overrides }));
};
