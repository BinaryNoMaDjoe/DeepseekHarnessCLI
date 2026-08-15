import React, { useEffect, useState } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Cheap braille spinner: one interval, 80ms cadence. */
export function Spinner({ label }: { label: string }): React.JSX.Element {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text>
      {FRAMES[frame]} {label}
    </Text>
  );
}
