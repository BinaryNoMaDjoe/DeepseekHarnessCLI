import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { ApprovalDecision, ApprovalRequest } from "@deepseek-harness/sdk";
import { useTheme } from "../theme-context.js";

export interface ApprovalPromptProps {
  request: ApprovalRequest;
  onDecide(decision: ApprovalDecision): void;
}

/**
 * Modal approval prompt: y=allow once, a=allow always, n=deny, esc=deny.
 * Question requests render their options with arrow navigation and space
 * to toggle multi-select; enter confirms the selection.
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

  if (request.question === undefined) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.spec.mode === "light" ? "black" : "white"}
      >
        <Text>{theme.warning("⚠ " + request.prompt)}</Text>
        <Text>{theme.secondary("y=allow once   a=allow always   n=deny   esc=deny")}</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.spec.mode === "light" ? "black" : "white"}
    >
      <Text>{theme.warning("? " + request.question.question)}</Text>
      {options.map((option, index) => {
        const marker = index === selected ? "›" : " ";
        const check = multi && toggled.has(option.label) ? "[x]" : multi ? "[ ]" : "";
        const label = index === selected ? theme.user(option.label) : option.label;
        return (
          <Text key={option.label}>
            {marker} {check} {label}
            {option.description !== undefined
              ? " " + theme.secondary("— " + option.description)
              : ""}
          </Text>
        );
      })}
      <Text>{theme.secondary("↑/↓ navigate   space=toggle   enter=confirm   esc=cancel")}</Text>
    </Box>
  );
}
