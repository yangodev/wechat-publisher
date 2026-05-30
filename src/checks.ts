import type { CheckItem, Checks } from "./types.js";

export function createChecks(): Checks {
  return {
    status: "ready",
    errors: [],
    warnings: [],
    infos: [],
    summary: {
      asset_count: 0,
      missing_asset_count: 0,
      remote_asset_count: 0,
      absolute_path_count: 0,
    },
  };
}

export function addError(checks: Checks, code: string, message: string, path?: string): void {
  checks.errors.push(item(code, message, path));
}

export function addWarning(checks: Checks, code: string, message: string, path?: string): void {
  checks.warnings.push(item(code, message, path));
}

export function addInfo(checks: Checks, code: string, message: string, path?: string): void {
  checks.infos.push(item(code, message, path));
}

export function finalizeChecks(checks: Checks): Checks {
  if (checks.errors.length > 0) {
    checks.status = "blocked";
  } else if (checks.warnings.length > 0) {
    checks.status = "warning";
  } else {
    checks.status = "ready";
  }

  return checks;
}

function item(code: string, message: string, path?: string): CheckItem {
  return path ? { code, message, path } : { code, message };
}
