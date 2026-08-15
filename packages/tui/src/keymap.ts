/**
 * Key binding helpers. Ink delivers input as { input, key } where input is a
 * rendered character and key carries the modifier state. These helpers give
 * the bindings stable names so tests don't depend on Ink's shapes.
 */

export interface KeyPress {
  input: string;
  key: {
    upArrow?: boolean;
    downArrow?: boolean;
    leftArrow?: boolean;
    rightArrow?: boolean;
    return?: boolean;
    escape?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    tab?: boolean;
    backspace?: boolean;
    delete?: boolean;
  };
}

export type Binding =
  | "submit"
  | "newline"
  | "cancel"
  | "exit"
  | "history-up"
  | "history-down"
  | "complete"
  | "backspace"
  | "delete-forward"
  | "left"
  | "right"
  | "paste-armed"
  | null;

/** Map a key press to one semantic binding. */
export function resolveBinding(press: KeyPress): Binding {
  const k = press.key;
  if (k.ctrl && press.input === "c") return "exit";
  if (k.escape) return "cancel";
  if (k.return) return k.ctrl ? "submit" : "submit";
  if (k.ctrl && press.input === "j") return "newline";
  if (k.upArrow) return "history-up";
  if (k.downArrow) return "history-down";
  if (k.tab) return "complete";
  if (k.backspace) return "backspace";
  if (k.delete) return "delete-forward";
  if (k.leftArrow) return "left";
  if (k.rightArrow) return "right";
  return null;
}
