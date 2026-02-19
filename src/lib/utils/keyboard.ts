/**
 * Keyboard utility functions for handling keyboard events
 */

export type OSType = "macos" | "windows" | "linux" | "unknown";

const FUNCTION_KEY_RE = /^F\d+$/;
const LETTER_KEY_RE = /^Key[A-Z]$/;
const DIGIT_KEY_RE = /^Digit\d$/;
const NUMPAD_DIGIT_RE = /^Numpad\d$/;

const getMetaKeyName = (osType: OSType): string => {
  if (osType === "macos") {
    return "command";
  }
  if (osType === "windows") {
    return "win";
  }
  return "super";
};

const getKeyFromCode = (code: string, osType: OSType): string => {
  if (FUNCTION_KEY_RE.test(code)) {
    return code.toLowerCase();
  }

  if (LETTER_KEY_RE.test(code)) {
    return code.replace("Key", "").toLowerCase();
  }

  if (DIGIT_KEY_RE.test(code)) {
    return code.replace("Digit", "");
  }

  if (NUMPAD_DIGIT_RE.test(code)) {
    return code.replace("Numpad", "numpad ").toLowerCase();
  }

  const getModifierName = (baseModifier: string): string => {
    switch (baseModifier) {
      case "shift":
        return "shift";
      case "ctrl":
        return "ctrl";
      case "alt":
        return osType === "macos" ? "option" : "alt";
      case "meta":
        return osType === "macos" ? "command" : "super";
      default:
        return baseModifier;
    }
  };

  const modifierMap: Record<string, string> = {
    ShiftLeft: getModifierName("shift"),
    ShiftRight: getModifierName("shift"),
    ControlLeft: getModifierName("ctrl"),
    ControlRight: getModifierName("ctrl"),
    AltLeft: getModifierName("alt"),
    AltRight: getModifierName("alt"),
    MetaLeft: getModifierName("meta"),
    MetaRight: getModifierName("meta"),
    OSLeft: getModifierName("meta"),
    OSRight: getModifierName("meta"),
    CapsLock: "caps lock",
    Tab: "tab",
    Enter: "enter",
    Space: "space",
    Backspace: "backspace",
    Delete: "delete",
    Escape: "esc",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Home: "home",
    End: "end",
    PageUp: "page up",
    PageDown: "page down",
    Insert: "insert",
    PrintScreen: "print screen",
    ScrollLock: "scroll lock",
    Pause: "pause",
    ContextMenu: "menu",
    NumpadMultiply: "numpad *",
    NumpadAdd: "numpad +",
    NumpadSubtract: "numpad -",
    NumpadDecimal: "numpad .",
    NumpadDivide: "numpad /",
    NumLock: "num lock",
  };

  if (modifierMap[code]) {
    return modifierMap[code];
  }

  const punctuationMap: Record<string, string> = {
    Semicolon: ";",
    Equal: "=",
    Comma: ",",
    Minus: "-",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    BracketLeft: "[",
    Backslash: "\\",
    BracketRight: "]",
    Quote: "'",
  };

  if (punctuationMap[code]) {
    return punctuationMap[code];
  }

  return code.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2");
};

const getKeyFromKeyProp = (key: string, osType: OSType): string => {
  const metaName = getMetaKeyName(osType);

  const keyMap: Record<string, string> = {
    Control: osType === "macos" ? "ctrl" : "ctrl",
    Alt: osType === "macos" ? "option" : "alt",
    Shift: "shift",
    Meta: metaName,
    OS: metaName,
    CapsLock: "caps lock",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Escape: "esc",
    " ": "space",
  };

  if (keyMap[key]) {
    return keyMap[key];
  }

  return key.toLowerCase();
};

/**
 * Extract a consistent key name from a KeyboardEvent
 * This function provides cross-platform keyboard event handling
 * and returns key names appropriate for the target operating system
 */
export const getKeyName = (
  e: KeyboardEvent,
  osType: OSType = "unknown"
): string => {
  if (e.code) {
    return getKeyFromCode(e.code, osType);
  }

  if (e.key) {
    return getKeyFromKeyProp(e.key, osType);
  }

  return `unknown-${e.keyCode || e.which || 0}`;
};

/**
 * Get display-friendly key combination string for the current OS
 * Returns basic plus-separated format with correct platform key names
 */
export const formatKeyCombination = (
  combination: string,
  _osType: OSType
): string => {
  // Simply return the combination as-is since getKeyName already provides
  // the correct platform-specific key names
  return combination;
};

/**
 * Normalize modifier keys to handle left/right variants
 */
export const normalizeKey = (key: string): string => {
  // Handle left/right variants of modifier keys
  if (key.startsWith("left ") || key.startsWith("right ")) {
    const parts = key.split(" ");
    if (parts.length === 2) {
      // Return just the modifier name without left/right prefix
      return parts[1];
    }
  }
  return key;
};
