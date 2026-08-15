import chalk from "chalk";

/** Central color tokens — the only place that names colors. */
export const theme = {
  user: chalk.cyanBright.bold,
  assistant: chalk.white,
  local: chalk.gray,
  toolName: chalk.magentaBright,
  toolOk: chalk.green,
  toolErr: chalk.redBright,
  status: chalk.dim,
  error: chalk.redBright,
  reasoning: chalk.gray.italic,
  approval: chalk.yellowBright,
  hint: chalk.gray,
  diffAdd: chalk.green,
  diffDel: chalk.red,
  diffContext: chalk.gray,
  code: chalk.blue,
  heading: chalk.bold,
};
