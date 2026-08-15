// Dev tool: provision the tui profile into a DSH_HOME (default: .tmp/dsh-home)
// with the local bundle linked, then hand over to dsh.
import { installProfile } from "../packages/cli/lib/install.js";
import { resolve } from "node:path";

const home = process.env.DSH_HOME ?? resolve(".tmp/dsh-home");
const linkPath = resolve("packages/bundle");
const result = installProfile({ home, linkPath });
console.log("dsht: tui profile installed at " + result.profileDir);
console.log("dsht: run: dsh --profile tui (with DSH_HOME=" + home + ")");
