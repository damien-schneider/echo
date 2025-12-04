import { invoke } from "@tauri-apps/api/core";
import { tool } from "ai";
import { z } from "zod";

// Define the input schemas
const openTerminalInputSchema = z.object({
  workingDirectory: z
    .string()
    .optional()
    .describe("Optional working directory to open the terminal in"),
});

const executeCommandInputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
  workingDirectory: z
    .string()
    .optional()
    .describe("Optional working directory to execute the command in"),
  captureOutput: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to capture and return the command output"),
});

const openFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "The file path or URL to open (e.g., '/path/to/file.txt', 'https://example.com', or application name)"
    ),
});

// Type inference
type OpenTerminalInput = z.infer<typeof openTerminalInputSchema>;
type ExecuteCommandInput = z.infer<typeof executeCommandInputSchema>;
type OpenFileInput = z.infer<typeof openFileInputSchema>;

/**
 * Tool to open the default terminal application
 */
export const openTerminalTool = tool({
  description:
    "Opens the default terminal application on the user's system. Use this when the user asks to open a terminal, command prompt, or shell.",
  inputSchema: openTerminalInputSchema,
  execute: async (input: OpenTerminalInput) => {
    try {
      const result = await invoke<{ success: boolean; message?: string }>(
        "open_terminal",
        { workingDirectory: input.workingDirectory }
      );
      return {
        success: result.success,
        message: result.message ?? "Terminal opened successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to open terminal: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * Tool to execute a shell command
 */
export const executeCommandTool = tool({
  description:
    "Executes a shell command on the user's system. Use this when the user asks to run a command, script, or program. Be cautious with potentially dangerous commands.",
  inputSchema: executeCommandInputSchema,
  execute: async (input: ExecuteCommandInput) => {
    try {
      const result = await invoke<{
        success: boolean;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        message?: string;
      }>("execute_shell_command", {
        command: input.command,
        workingDirectory: input.workingDirectory,
        captureOutput: input.captureOutput,
      });
      return {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        message: result.message ?? "Command executed",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * Tool to open a file or URL with the default application
 */
export const openFileTool = tool({
  description:
    "Opens a file or URL with the default application. Use this when the user asks to open a document, website, application, or folder.",
  inputSchema: openFileInputSchema,
  execute: async (input: OpenFileInput) => {
    try {
      const result = await invoke<{ success: boolean; message?: string }>(
        "open_path",
        { path: input.path }
      );
      return {
        success: result.success,
        message: result.message ?? `Opened: ${input.path}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to open: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * All available tools for post-processing
 */
export const postProcessTools = {
  openTerminal: openTerminalTool,
  executeCommand: executeCommandTool,
  openFile: openFileTool,
};

export type PostProcessTools = typeof postProcessTools;
