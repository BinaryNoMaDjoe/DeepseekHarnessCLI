#!/usr/bin/env node
import { installProfile } from "../lib/install.js";
try {
  const result = installProfile({ linkPath: process.argv[2] });
  console.log("dsht: tui profile installed at " + result.profileDir);
} catch (error) {
  console.error("dsht: " + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
