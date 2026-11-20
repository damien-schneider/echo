export type OSType = "macos" | "windows" | "linux" | "unknown";

type KeyIdentity = Pick<KeyboardEvent, "code" | "key">;

const FUNCTION_KEY_RE = /^F\d+$/;
const LETTER_KEY_RE = /^Key[A-Z]$/;
const DIGIT_KEY_RE = /^Digit\d$/;
const NUMPAD_DIGIT_RE = /^Numpad\d$/;
const UNIDENTIFIED = "Unidentified";

const altName = (osType: OSType) => (osType === "macos" ? "option" : "alt");
const metaName = (osType: OSType) => (osType === "macos" ? "command" : "super");

const fixedCodeNames: Record<string, string> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  Backquote: "`",
  Backslash: "\\",
  Backspace: "backspace",
  BracketLeft: "[",
  BracketRight: "]",
  CapsLock: "capslock",
  Comma: ",",
  ControlLeft: "ctrl",
  ControlRight: "ctrl",
  Delete: "delete",
  End: "end",
  Enter: "enter",
  Equal: "=",
  Escape: "esc",
  Home: "home",
  Insert: "insert",
  Minus: "-",
  NumLock: "numlock",
  NumpadAdd: "numadd",
  NumpadDecimal: "numdecimal",
  NumpadDivide: "numdivide",
  NumpadEnter: "numenter",
  NumpadEqual: "numequal",
  NumpadMultiply: "nummultiply",
  NumpadSubtract: "numsubtract",
  PageDown: "pagedown",
  PageUp: "pageup",
  Pause: "pause",
  Period: ".",
  PrintScreen: "printscreen",
  Quote: "'",
  ScrollLock: "scrolllock",
  Semicolon: ";",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  Slash: "/",
  Space: "space",
  Tab: "tab",
};

const getKeyFromCode = (code: string, osType: OSType): string => {
  if (FUNCTION_KEY_RE.test(code) || LETTER_KEY_RE.test(code)) {
    return code.replace("Key", "").toLowerCase();
  }
  if (DIGIT_KEY_RE.test(code)) {
    return code.replace("Digit", "");
  }
  if (NUMPAD_DIGIT_RE.test(code)) {
    return code.replace("Numpad", "num");
  }
  switch (code) {
    case "AltLeft":
    case "AltRight":
      return altName(osType);
    case "MetaLeft":
    case "MetaRight":
    case "OSLeft":
    case "OSRight":
      return metaName(osType);
    default:
      return fixedCodeNames[code] ?? code.toLowerCase();
  }
};

const fixedKeyPropNames: Record<string, string> = {
  " ": "space",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  CapsLock: "capslock",
  Control: "ctrl",
  Escape: "esc",
  PageDown: "pagedown",
  PageUp: "pageup",
  Shift: "shift",
};

const getKeyFromKeyProp = (key: string, osType: OSType): string => {
  switch (key) {
    case "Alt":
      return altName(osType);
    case "Meta":
    case "OS":
      return metaName(osType);
    default:
      return fixedKeyPropNames[key] ?? key.toLowerCase().replaceAll(" ", "");
  }
};

export const getKeyName = (
  { code, key }: KeyIdentity,
  osType: OSType = "unknown"
): string | null => {
  if (code && code !== UNIDENTIFIED) {
    return getKeyFromCode(code, osType);
  }
  if (key && key !== UNIDENTIFIED) {
    return getKeyFromKeyProp(key, osType);
  }
  return null;
};
