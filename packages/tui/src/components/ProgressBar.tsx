import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

const BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

/**
 * Eighths-precision progress bar (Claude-style) for context usage and
 * other ratios. Filled portion uses the theme's borderFocus (white).
 */
export function ProgressBar({ ratio, width }: { ratio: number; width: number }): React.JSX.Element {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, ratio));
  const whole = Math.floor(clamped * width);
  const fill = BLOCKS[BLOCKS.length - 1]!.repeat(whole);
  let rest = "";
  if (whole < width) {
    const remainder = clamped * width - whole;
    // BLOCKS has 9 symbols representing 0/8..8/8; scale by 8, not 9, so a
    // nearly-full cell renders the last partial block instead of █.
    const middle =
      BLOCKS[Math.min(BLOCKS.length - 1, Math.floor(remainder * (BLOCKS.length - 1)))]!;
    rest = middle + BLOCKS[0]!.repeat(width - whole - 1);
  }
  return (
    <Text>
      {theme.borderFocus(fill)}
      {theme.muted(rest)}
    </Text>
  );
}
