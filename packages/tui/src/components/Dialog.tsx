import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DialogRequest, DialogResult } from "../store.js";
import { useTheme } from "../theme-context.js";

const PAGE_SIZE = 12;

/**
 * Modal dialog v2 — implements the Kimi DESIGN.md dialog spec:
 * top full-width border, title (+type-to-search suffix), muted hint
 * line, Search: row, ❯ pointer / ← current markers, scrolling
 * indicator, bottom full-width border.
 */
export function Dialog({
  request,
  onResult,
}: {
  request: DialogRequest;
  onResult(result: DialogResult): void;
}): React.JSX.Element {
  return request.kind === "list" ? (
    <ListDialog request={request} onResult={onResult} />
  ) : (
    <FieldsDialog request={request} onResult={onResult} />
  );
}

function ListDialog({
  request: req,
  onResult,
}: {
  request: Extract<DialogRequest, { kind: "list" }>;
  onResult(result: DialogResult): void;
}): React.JSX.Element {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (query === "") return req.items;
    const q = query.toLowerCase();
    return req.items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.detail?.toLowerCase().includes(q) ?? false) ||
        (item.meta?.some((line) => line.toLowerCase().includes(q)) ?? false),
    );
  }, [req.items, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useInput((input, key) => {
    if (key.escape) {
      if (query !== "") setQuery("");
      else onResult(null);
      return;
    }
    if (key.upArrow) {
      setCursor((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((current) => Math.min(visible.length - 1, current + 1));
      return;
    }
    if (key.pageDown || (input === " " && req.multi)) {
      if (key.pageDown) {
        setPage((current) => Math.min(pageCount - 1, current + 1));
        setCursor(0);
      } else if (req.multi && visible[cursor] !== undefined) {
        const label = visible[cursor]!.id;
        setToggled((current) => {
          const next = new Set(current);
          if (next.has(label)) next.delete(label);
          else next.add(label);
          return next;
        });
      }
      return;
    }
    if (key.pageUp) {
      setPage((current) => Math.max(0, current - 1));
      setCursor(0);
      return;
    }
    if (key.return || input === "\r" || input === "\n" || input === "\r\n") {
      if (req.multi) {
        onResult([...toggled]);
        return;
      }
      const selected = visible[cursor];
      if (selected !== undefined) onResult([selected.id]);
      return;
    }
    if (key.backspace || (key.delete && input === "")) {
      setQuery((current) => current.slice(0, -1));
      setPage(0);
      setCursor(0);
      return;
    }
    if (input !== "" && !key.ctrl && !key.meta) {
      setQuery((current) => current + input);
      setPage(0);
      setCursor(0);
    }
  });

  const hint =
    req.hint ??
    (req.searchable
      ? "↑↓ navigate · PgUp/PgDn page · Enter select · Esc cancel"
      : req.multi
        ? "↑↓ navigate · Space toggle · Enter confirm · Esc cancel"
        : "↑↓ navigate · Enter select · Esc cancel");

  return (
    <Box flexDirection="column">
      <Text>{theme.border("─".repeat(80))}</Text>
      <Text>
        {theme.strong(" " + req.title)}
        {req.searchable && query === "" ? theme.muted("  (type to search)") : ""}
      </Text>
      <Text>{theme.muted(" " + hint)}</Text>
      <Text> </Text>
      {query !== "" ? <Text>{theme.muted(" Search: ") + theme.primary(query)}</Text> : null}
      {visible.map((item, index) => {
        const pointer = index === cursor ? theme.primary("❯ ") : "  ";
        const check =
          req.multi && toggled.has(item.id)
            ? theme.success("[x] ")
            : req.multi
              ? theme.muted("[ ] ")
              : "";
        const label =
          index === cursor
            ? theme.strong(item.label)
            : item.danger
              ? theme.error(item.label)
              : theme.text(item.label);
        return (
          <Box key={item.id} flexDirection="column">
            <Text>
              {pointer}
              {check}
              {label}
              {item.detail !== undefined ? theme.muted("  " + item.detail) : ""}
              {item.current === true ? theme.success("  ← current") : ""}
            </Text>
            {item.meta !== undefined && item.meta.length > 0 ? (
              <Text>{theme.muted("   " + item.meta.join(" · "))}</Text>
            ) : null}
          </Box>
        );
      })}
      <Text> </Text>
      <Text>
        {query === ""
          ? theme.muted(" ▼ " + Math.max(0, filtered.length - (safePage + 1) * PAGE_SIZE) + " more")
          : theme.muted(" " + filtered.length + " matches")}
      </Text>
      <Text>{theme.border("─".repeat(80))}</Text>
    </Box>
  );
}

function FieldsDialog({
  request: req,
  onResult,
}: {
  request: Extract<DialogRequest, { kind: "fields" }>;
  onResult(result: DialogResult): void;
}): React.JSX.Element {
  const theme = useTheme();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(req.fields.map((field) => [field.key, field.value])),
  );
  const [fieldIndex, setFieldIndex] = useState(0);

  const field = req.fields[fieldIndex];

  useInput((input, key) => {
    if (key.escape || (key.ctrl && (input === "c" || input === "C"))) {
      onResult(null);
      return;
    }
    if (key.tab || key.upArrow || key.downArrow) {
      setFieldIndex(
        (current) =>
          (current +
            (key.tab && input === "Z" ? -1 : key.tab ? 1 : key.upArrow ? -1 : 1) +
            req.fields.length) %
          req.fields.length,
      );
      return;
    }
    if (key.return || input === "\r" || input === "\n") {
      if (fieldIndex < req.fields.length - 1) {
        setFieldIndex((current) => current + 1);
      } else {
        onResult(values);
      }
      return;
    }
    if (key.backspace || (key.delete && input === "")) {
      setValues((current) => ({
        ...current,
        [field!.key]: (current[field!.key] ?? "").slice(0, -1),
      }));
      return;
    }
    if (input !== "" && !key.ctrl && !key.meta) {
      setValues((current) => ({
        ...current,
        [field!.key]: (current[field!.key] ?? "") + input,
      }));
    }
  });

  const hint =
    req.hint ??
    (fieldIndex < req.fields.length - 1
      ? "Tab/↑↓ field · Enter next · Esc cancel"
      : "Tab/↑↓ field · Enter submit · Esc cancel");

  return (
    <Box flexDirection="column">
      <Text>{theme.border("─".repeat(80))}</Text>
      <Text>{theme.strong(" " + req.title)}</Text>
      <Text>{theme.muted(" " + hint)}</Text>
      <Text> </Text>
      {req.fields.map((f, index) => (
        <Text key={f.key}>
          {index === fieldIndex ? theme.primary("❯ ") : "  "}
          {theme.dim(f.label + ": ")}
          {index === fieldIndex
            ? theme.inverted((values[f.key] ?? "") + " ")
            : theme.text(values[f.key] ?? "")}
        </Text>
      ))}
      <Text> </Text>
      <Text>{theme.border("─".repeat(80))}</Text>
    </Box>
  );
}
