import React from "react";
import { Box, Text } from "ink";
import { renderMarkdown, wrapText, type InlineNode, type MarkdownNode } from "../markdown.js";
import { useTheme } from "../theme-context.js";

export interface BlockTextProps {
  text: string;
  width: number;
}

/** Render agent text: markdown blocks with inline emphasis and tables. */
export function BlockText({ text, width }: BlockTextProps): React.JSX.Element {
  const nodes = renderMarkdown(text);
  return (
    <Box flexDirection="column">
      {nodes.map((node, index) => (
        <MarkdownRow key={index} node={node} width={width} />
      ))}
    </Box>
  );
}

/** Inline nodes rendered inside one Text with per-span styling. */
export function Inline({ nodes }: { nodes: InlineNode[] }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Text>
      {nodes.map((node, index) => {
        switch (node.type) {
          case "bold":
            return <Text key={index}>{theme.strong(node.text)}</Text>;
          case "italic":
            return <Text key={index}>{theme.italic(node.text)}</Text>;
          case "code":
            return <Text key={index}>{theme.inlineCode(node.text)}</Text>;
          default:
            return <Text key={index}>{theme.text(node.text)}</Text>;
        }
      })}
    </Text>
  );
}

function MarkdownRow({ node, width }: { node: MarkdownNode; width: number }): React.JSX.Element {
  const theme = useTheme();
  switch (node.type) {
    case "blank":
      return <Text> </Text>;
    case "hr":
      return <Text>{theme.border("─".repeat(Math.min(width, 40)))}</Text>;
    case "heading":
      return (
        <Box marginTop={node.level <= 2 ? 1 : 0}>
          <Text>
            {theme.strong(
              node.level <= 2 ? "─ " + inlineText(node.inline) : inlineText(node.inline),
            )}
          </Text>
        </Box>
      );
    case "code":
      return (
        <Box flexDirection="column" marginLeft={1}>
          <Text>{theme.border("╭─ " + (node.lang !== "" ? node.lang : "code"))}</Text>
          {wrapText(node.text, Math.max(20, width - 4)).map((line, index) => (
            <Text key={index}>
              {theme.border("│ ")}
              {theme.text(line)}
            </Text>
          ))}
          <Text>{theme.border("╰─")}</Text>
        </Box>
      );
    case "bullet":
      return (
        <Box>
          <Text>{theme.border(node.ordered ? "  " + String(node.index) + ". " : "  • ")}</Text>
          <Inline nodes={node.inline} />
        </Box>
      );
    case "quote":
      return (
        <Box>
          <Text>{theme.border("│ ")}</Text>
          <Inline nodes={node.inline} />
        </Box>
      );
    case "table": {
      const widths = node.header.map((cell, index) =>
        Math.max(cell.length, ...node.rows.map((row) => (row[index] ?? "").length)),
      );
      const renderRow = (cells: string[], dim: boolean, key: number) => (
        <Text key={key}>
          {cells.map((cell, index) => (
            <Text key={index}>
              {theme.border("│ ")}
              {dim
                ? theme.strong(cell.padEnd(widths[index] ?? cell.length))
                : theme.text(cell.padEnd(widths[index] ?? cell.length))}{" "}
            </Text>
          ))}
          {theme.border("│")}
        </Text>
      );
      return (
        <Box flexDirection="column" marginLeft={1}>
          {renderRow(node.header, true, 0)}
          <Text>
            {theme.border(
              "├" +
                "─".repeat(
                  Math.max(
                    3,
                    widths.reduce((sum, w) => sum + w + 2, 1),
                  ),
                ) +
                "┤",
            )}
          </Text>
          {node.rows.map((row, rowIndex) => renderRow(row, false, rowIndex + 1))}
        </Box>
      );
    }
    case "paragraph":
      return <Inline nodes={node.inline} />;
  }
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => node.text).join("");
}
