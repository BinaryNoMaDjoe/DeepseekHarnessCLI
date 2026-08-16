import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Key } from "ink";
import { useTheme } from "../theme-context.js";

export interface InputBoxProps {
  history: string[];
  disabled: boolean;
  onSubmit(text: string): void;
  onCancel(): void;
  onExit(): void;
}

/**
 * The prompt: a rounded input panel (primary border) with cursor
 * rendering, history recall, and paste-safe line splitting.
 */
export function InputBox({
  history,
  disabled,
  onSubmit,
  onCancel,
  onExit,
}: InputBoxProps): React.JSX.Element {
  const theme = useTheme();
  const [buffer, setBuffer] = useState("");
  const [cursor, setCursor] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key: Key) => {
    if (process.env.DSH_INPUT_LOG !== undefined) {
      void import("node:fs").then((fs) => {
        fs.appendFileSync(
          process.env.DSH_INPUT_LOG as string,
          JSON.stringify({ input, escape: key.escape, ctrl: key.ctrl, ret: key.return }) + "\n",
        );
      });
    }
    if (key.escape) {
      if (buffer !== "") {
        setBuffer("");
        setCursor(0);
      } else {
        onCancel();
      }
      return;
    }
    if (key.ctrl && (input === "c" || input === "C" || input === "\x03")) {
      onExit();
      return;
    }
    if (key.upArrow) {
      const next = historyIndex + 1;
      if (next < history.length) {
        setHistoryIndex(next);
        const item = history[history.length - 1 - next] ?? "";
        setBuffer(item);
        setCursor(item.length);
      }
      return;
    }
    if (key.downArrow) {
      const next = historyIndex - 1;
      if (next >= 0) {
        setHistoryIndex(next);
        const item = history[history.length - 1 - next] ?? "";
        setBuffer(item);
        setCursor(item.length);
      } else {
        setHistoryIndex(-1);
        setBuffer("");
        setCursor(0);
      }
      return;
    }
    if (key.return || input === "\r" || input === "\n" || input === "\r\n") {
      if (key.ctrl) {
        insert("\n");
        return;
      }
      if (buffer.trim() !== "" && !disabled) {
        onSubmit(buffer);
        setBuffer("");
        setCursor(0);
        setHistoryIndex(-1);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor(Math.max(0, cursor - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor(Math.min(buffer.length, cursor + 1));
      return;
    }
    if (key.backspace || (key.delete && input === "")) {
      if (cursor > 0) {
        setBuffer(buffer.slice(0, cursor - 1) + buffer.slice(cursor));
        setCursor(cursor - 1);
      }
      return;
    }
    if (key.delete) {
      if (cursor < buffer.length) {
        setBuffer(buffer.slice(0, cursor) + buffer.slice(cursor + 1));
      }
      return;
    }
    if (input !== "") {
      if (input.includes("\r") || input.includes("\n")) {
        const segments = input.split(/\r\n|\r|\n/);
        let carry = buffer;
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i] ?? "";
          const isLast = i === segments.length - 1;
          if (isLast) {
            if (segment !== "") {
              const next = carry + segment;
              setBuffer(next);
              setCursor(next.length);
            }
          } else {
            const next = carry + segment;
            if (next.trim() !== "" && !disabled) onSubmit(next);
            carry = "";
          }
        }
        if (segments.length > 1) {
          setBuffer(carry);
          setCursor(carry.length);
          setHistoryIndex(-1);
        }
        return;
      }
      insert(input);
    }
  });

  function insert(text: string): void {
    setBuffer(buffer.slice(0, cursor) + text + buffer.slice(cursor));
    setCursor(cursor + text.length);
  }

  const before = buffer.slice(0, cursor);
  const at = buffer[cursor] ?? "";
  const after = buffer.slice(cursor + 1);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.spec.mode === "light" ? "black" : "white"}
      paddingX={1}
    >
      <Text>
        {theme.user("❯ ")}
        {buffer === "" ? (
          theme.muted("输入消息，/help 查看命令…")
        ) : (
          <Text>
            {before}
            {theme.inverted(at === "" ? " " : at)}
            {after}
          </Text>
        )}
      </Text>
    </Box>
  );
}
