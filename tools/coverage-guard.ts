/**
 * Coverage guard (AR-1.3): every command in the vendored catalog must be
 * either surfaced by the extension or listed in the shrink-only exclusion
 * ledger. The ledger doubles as the feature burn-down: it starts holding
 * every command and shrinks as epics land; at V1 exit it may contain only
 * the §2 out-of-scope entries.
 *
 * Files:
 *   coverage/surfaced.json  — command ids the extension actually surfaces
 *   coverage/ledger.json    — everything else, with status pending|excluded
 *
 * Usage:
 *   npm run guard                        # partition + staleness checks
 *   npm run guard -- --base origin/main  # additionally: shrink-only vs base
 *   npm run guard -- --init              # (re)create the initial ledger
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

interface LedgerEntry {
  status: "pending" | "excluded";
  planned?: string;
  reason?: string;
}
type Ledger = Record<string, LedgerEntry>;

function fail(lines: string[]): never {
  for (const line of lines) console.error(`coverage-guard: ${line}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let root = path.resolve(__dirname, "..");
  let base: string | undefined;
  let init = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root") root = path.resolve(String(args[++i]));
    else if (args[i] === "--base") base = String(args[++i]);
    else if (args[i] === "--init") init = true;
    else fail([`unknown argument: ${args[i]}`]);
  }
  return { root, base, init };
}

function catalogIds(root: string): string[] {
  const index = JSON.parse(
    fs.readFileSync(path.join(root, "idl", "v1", "generated", "command-index.json"), "utf8"),
  ) as { commands: Array<{ id: string; family: string }> };
  return index.commands.map((c) => c.id).sort();
}

function initLedger(root: string): void {
  const index = JSON.parse(
    fs.readFileSync(path.join(root, "idl", "v1", "generated", "command-index.json"), "utf8"),
  ) as { commands: Array<{ id: string; family: string }> };
  const ledger: Ledger = {};
  for (const cmd of [...index.commands].sort((a, b) => a.id.localeCompare(b.id))) {
    ledger[cmd.id] =
      cmd.family === "inference"
        ? { status: "excluded", reason: "§2 out of scope (V1): inference/generation UI is not surfaced" }
        : { status: "pending", planned: "E7 (console catalog; many commands surface earlier in E4–E6)" };
  }
  const dir = path.join(root, "coverage");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ledger.json"), JSON.stringify(ledger, null, 2) + "\n");
  const surfacedPath = path.join(dir, "surfaced.json");
  if (!fs.existsSync(surfacedPath)) fs.writeFileSync(surfacedPath, "[]\n");
  console.log(`coverage-guard: initialized ledger with ${Object.keys(ledger).length} entries`);
}

function main(): void {
  const { root, base, init } = parseArgs();
  if (init) {
    initLedger(root);
    return;
  }

  const ids = catalogIds(root);
  const idSet = new Set(ids);
  const surfaced = JSON.parse(
    fs.readFileSync(path.join(root, "coverage", "surfaced.json"), "utf8"),
  ) as string[];
  const ledger = JSON.parse(
    fs.readFileSync(path.join(root, "coverage", "ledger.json"), "utf8"),
  ) as Ledger;

  const problems: string[] = [];
  const surfacedSet = new Set(surfaced);

  for (const id of surfaced) {
    if (!idSet.has(id)) problems.push(`surfaced.json lists unknown command: ${id}`);
  }
  for (const id of Object.keys(ledger)) {
    if (!idSet.has(id)) problems.push(`ledger.json lists unknown command: ${id} (stale after a pin bump?)`);
    if (surfacedSet.has(id)) problems.push(`${id} is both surfaced and ledgered — remove it from the ledger`);
  }
  for (const id of ids) {
    if (!surfacedSet.has(id) && !(id in ledger)) {
      problems.push(`${id} is neither surfaced nor in the exclusion ledger (AR-1.3)`);
    }
  }

  // Shrink-only: new ledger entries are only legitimate for commands that are
  // themselves new to the catalog since base.
  if (base) {
    let baseLedger: Ledger | null = null;
    let baseIds: Set<string> | null = null;
    try {
      baseLedger = JSON.parse(
        execFileSync("git", ["-C", root, "show", `${base}:coverage/ledger.json`], {
          encoding: "utf8",
        }),
      ) as Ledger;
      const baseIndex = JSON.parse(
        execFileSync(
          "git",
          ["-C", root, "show", `${base}:idl/v1/generated/command-index.json`],
          { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        ),
      ) as { commands: Array<{ id: string }> };
      baseIds = new Set(baseIndex.commands.map((c) => c.id));
    } catch {
      console.log(`coverage-guard: no ledger/catalog at ${base} — skipping shrink-only check`);
    }
    if (baseLedger && baseIds) {
      for (const id of Object.keys(ledger)) {
        if (!(id in baseLedger) && baseIds.has(id)) {
          problems.push(
            `${id} entered the ledger but is not new to the catalog — the ledger is shrink-only (AR-1.3)`,
          );
        }
      }
    }
  }

  if (problems.length > 0) fail(problems);

  const pending = Object.values(ledger).filter((e) => e.status === "pending").length;
  const excluded = Object.values(ledger).filter((e) => e.status === "excluded").length;
  console.log(
    `coverage-guard: ok — ${surfaced.length} surfaced, ${pending} pending, ${excluded} excluded ` +
      `of ${ids.length} commands`,
  );
}

main();
