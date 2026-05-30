#!/usr/bin/env node
import { printVisualQaSummary, runVisualQa } from "./visual-qa.js";

const args = parseArgs(process.argv.slice(2));

try {
  const { report, reportPath } = await runVisualQa({
    distDir: args.distDir ?? "fixtures/basic-article/dist",
    report: args.report,
    screenshots: args.screenshots,
  });
  printVisualQaSummary(report, reportPath);
  process.exitCode = report.status === "failed" ? 2 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

interface RunnerArgs {
  distDir?: string;
  report?: string;
  screenshots?: string;
}

function parseArgs(argv: string[]): RunnerArgs {
  const parsed: RunnerArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      parsed.report = argv[index + 1];
      index += 1;
    } else if (arg === "--screenshots") {
      parsed.screenshots = argv[index + 1];
      index += 1;
    } else if (!arg.startsWith("--") && !parsed.distDir) {
      parsed.distDir = arg;
    }
  }
  return parsed;
}
