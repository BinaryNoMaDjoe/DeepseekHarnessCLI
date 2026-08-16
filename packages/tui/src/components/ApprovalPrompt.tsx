import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalDecision, ApprovalRequest } from "@deepseek-harness/sdk";
import { useTheme } from "../theme-context.js";

export interface ApprovalPromptProps {
  request: ApprovalRequest;
  onDecide(decision: ApprovalDecision): void;
}

/**
 * Modal approval prompt, aligned with the dialog spec: top/bottom
 * borders, bold title, muted hint line, ❯ pointer for question options.
 */
export function ApprovalPrompt({ request, onDecide }: ApprovalPromptProps): React.JSX.Element {
  const theme = useTheme();
  const [selected, setSelected] = useState(0);
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const options = request.question?.options ?? [];
  const multi = request.question?.multiSelect ?? false;

  useInput((input, key) => {
    if (request.question === undefined) {
      if (input === "y" || input === "Y") onDecide({ action: "allow" });
      else if (input === "a" || input === "A") onDecide({ action: "allow-always" });
      else if (input === "n" || input === "N" || key.escape) onDecide({ action: "deny" });
      return;
    }
    if (key.upArrow) setSelected((current) => Math.max(0, current - 1));
    else if (key.downArrow) setSelected((current) => Math.min(options.length - 1, current + 1));
    else if (key.return || input === "\r" || input === "\n" || input === "\r\n") {
      const labels = multi
        ? [...toggled]
        : options[selected] !== undefined
          ? [options[selected].label]
          : [];
      onDecide({ action: "answer", selected: labels });
    } else if (key.escape) onDecide({ action: "deny" });
    else if (input === " " && multi && options[selected] !== undefined) {
      setToggled((current) => {
        const next = new Set(current);
        const label = options[selected]!.label;
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    }
  });

  const title = request.question !== undefined ? request.question.question : request.prompt;
  const hint =
    request.question !== undefined
      ? "↑↓ navigate · Space toggle · Enter confirm · Esc cancel"
      : "y allow once · a allow always · n deny · Esc deny";

  return (
    <Box flexDirection="column">
      <Text>{theme.border("─".repeat(80))}</Text>
      <Text>{theme.strong(" " + title)}</Text>
      <Text>{theme.muted(" " + hint)}</Text>
      {options.map((option, index) => {
        const pointer = index === selected ? theme.primary("❯ ") : "  ";
        const check =
          multi && toggled.has(option.label)
            ? theme.success("[x] ")
            : multi
              ? theme.muted("[ ] ")
              : "";
        const label = index === selected ? theme.strong(option.label) : theme.text(option.label);
        return (
          <Text key={option.label}>
            {pointer}
            {check}
            {label}
            {option.description !== undefined ? theme.muted("  — " + option.description) : ""}
          </Text>
        );
      })}
      <Text>{theme.border("─".repeat(80))}</Text>
    </Box>
  );
}
