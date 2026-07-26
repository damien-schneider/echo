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
    AltLeft: getModifierName("alt"),
    AltRight: getModifierName("alt"),
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    Backspace: "backspace",
    CapsLock: "caps lock",
    ContextMenu: "menu",
    ControlLeft: getModifierName("ctrl"),
    ControlRight: getModifierName("ctrl"),
    Delete: "delete",
    End: "end",
    Enter: "enter",
    Escape: "esc",
    Home: "home",
    Insert: "insert",
    MetaLeft: getModifierName("meta"),
    MetaRight: getModifierName("meta"),
    NumLock: "num lock",
    NumpadAdd: "numpad +",
    NumpadDecimal: "numpad .",
    NumpadDivide: "numpad /",
    NumpadMultiply: "numpad *",
    NumpadSubtract: "numpad -",
    OSLeft: getModifierName("meta"),
    OSRight: getModifierName("meta"),
    PageDown: "page down",
    PageUp: "page up",
    Pause: "pause",
    PrintScreen: "print screen",
    ScrollLock: "scroll lock",
    ShiftLeft: getModifierName("shift"),
    ShiftRight: getModifierName("shift"),
    Space: "space",
    Tab: "tab",
  };

  if (modifierMap[code]) {
    return modifierMap[code];
  }

  const punctuationMap: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Equal: "=",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
  };

  if (punctuationMap[code]) {
    return punctuationMap[code];
  }

  return code.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2");
};

const getKeyFromKeyProp = (key: string, osType: OSType): string => {
  const metaName = getMetaKeyName(osType);

  const keyMap: Record<string, string> = {
    " ": "space",
    Alt: osType === "macos" ? "option" : "alt",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    CapsLock: "caps lock",
    Control: osType === "macos" ? "ctrl" : "ctrl",
    Escape: "esc",
    Meta: metaName,
    OS: metaName,
    Shift: "shift",
  };

  if (keyMap[key]) {
    return keyMap[key];
  }

  return key.toLowerCase();
};

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

// getKeyName already returns platform-specific names — passthrough.
export const formatKeyCombination = (
  combination: string,
  _osType: OSType
): string => combination;

export const normalizeKey = (key: string): string => {
  // Strip left/right modifier prefix.
  if (key.startsWith("left ") || key.startsWith("right ")) {
    const parts = key.split(" ");
    if (parts.length === 2 && parts[1]) {
      return parts[1];
    }
  }
  return key;
};
