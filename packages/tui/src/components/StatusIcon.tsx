import React from "react";
import { Text } from "ink";
import { useTheme } from "../theme-context.js";

export type Status = "success" | "error" | "warning" | "info" | "pending" | "loading";

const CONFIG: Record<
  Status,
  { icon: string; token: "success" | "error" | "warning" | "muted" | "dim" }
> = {
  success: { icon: "✓", token: "success" },
  error: { icon: "✗", token: "error" },
  warning: { icon: "⚠", token: "warning" },
  info: { icon: "ℹ", token: "dim" },
  pending: { icon: "○", token: "muted" },
  loading: { icon: "…", token: "muted" },
};

/** One of six status icons (Claude-style), all themed. */
export function StatusIcon({
  status,
  withSpace = false,
}: {
  status: Status;
  withSpace?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const config = CONFIG[status];
  const styled =
    config.token === "success"
      ? theme.success(config.icon)
      : config.token === "error"
        ? theme.error(config.icon)
        : config.token === "warning"
          ? theme.warning(config.icon)
          : config.token === "muted"
            ? theme.muted(config.icon)
            : theme.dim(config.icon);
  return (
    <Text>
      {styled}
      {withSpace ? " " : ""}
    </Text>
  );
}
