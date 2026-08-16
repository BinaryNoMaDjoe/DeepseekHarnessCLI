import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Braille spinner with a shimmer label: every other frame the label
 * renders in the lighter shimmer shade (Claude-style two-tone motion).
 */
export function Spinner({ label }: { label: string }): React.JSX.Element {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  const shimmer = frame % 2 === 1;
  return (
    <Text>
      {theme.primary(FRAMES[frame]!)} {shimmer ? theme.shimmer(label) : theme.dim(label)}
    </Text>
  );
}
