import React from "react";
import { Box, Text } from "ink";
import { renderMarkdown, stripInline, wrapText, type MarkdownNode } from "../markdown.js";
import { useTheme } from "../theme-context.js";

export interface BlockTextProps {
  text: string;
  width: number;
}

/** Render agent text: markdown-lite with hard wrapping and inline stripping. */
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

function MarkdownRow({ node, width }: { node: MarkdownNode; width: number }): React.JSX.Element {
  const theme = useTheme();
  switch (node.type) {
    case "blank":
      return <Text> </Text>;
    case "heading":
      return <Text>{theme.heading(node.text)}</Text>;
    case "code":
      return (
        <Box flexDirection="column" marginLeft={1}>
          {wrapText(node.text, Math.max(20, width - 4)).map((line, index) => (
            <Text key={index}>{theme.code(line)}</Text>
          ))}
        </Box>
      );
    case "bullet":
      return (
        <Text>
          {"  • "}
          {wrapText(stripInline(node.text), Math.max(20, width - 6)).join("\n      ")}
        </Text>
      );
    case "quote":
      return <Text>{theme.secondary("│ " + stripInline(node.text))}</Text>;
    case "paragraph":
      return <Text>{wrapText(stripInline(node.text), width).join("\n")}</Text>;
  }
}
