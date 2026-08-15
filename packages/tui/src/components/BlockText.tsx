import React from "react";
import { Box, Text } from "ink";
import { renderMarkdown, stripInline, wrapText, type MarkdownNode } from "../markdown.js";
import { theme } from "../theme.js";

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
  switch (node.type) {
    case "blank":
      return <Text> </Text>;
    case "heading":
      return <Text color="whiteBright">{theme.heading(node.text)}</Text>;
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
      return <Text>{theme.hint("│ " + stripInline(node.text))}</Text>;
    case "paragraph":
      return <Text>{wrapText(stripInline(node.text), width).join("\n")}</Text>;
  }
}
