/**
 * Vendors the Strata IDL artifacts (AR-1.1) from a strata-core checkout into
 * idl/v1/, pinned by idl/v1/STRATA_CORE_REV.
 *
 * Files are extracted with `git archive <rev>` so the vendored content always
 * matches the pin exactly, regardless of the checkout's working-tree state.
 *
 * Usage:
 *   npm run vendor                       # re-vendor at the recorded pin
 *   npm run vendor -- --rev <sha>        # move the pin (a deliberate PR, N9)
 *   npm run vendor -- --core <path>      # strata-core checkout (default ../strata-core)
 *
 * The release tarball (strata-idl-docs.tar.gz) is the acceptable alternative
 * source per AR-1.1; until the release train exists (D8) its layout is
 * unpublished, so this tool only supports checkout vendoring.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");
const IDL_DIR = path.join(REPO_ROOT, "idl", "v1");
const REV_FILE = path.join(IDL_DIR, "STRATA_CORE_REV");

/** Paths inside strata-core → destination inside idl/v1. */
const VENDOR_MAP: ReadonlyArray<{ src: string; dest: string }> = [
  { src: "crates/executor/idl/v1/manifest.yaml", dest: "manifest.yaml" },
  { src: "crates/executor/idl/v1/errors.yaml", dest: "errors.yaml" },
  { src: "crates/executor/idl/v1/families.yaml", dest: "families.yaml" },
  {
    src: "crates/executor/idl/v1/generated/command-index.json",
    dest: "generated/command-index.json",
  },
  { src: "crates/executor/idl/v1/generated/schemas", dest: "generated/schemas" },
  { src: "crates/executor/tests/fixtures/requests/v1", dest: "fixtures/requests/v1" },
  { src: "crates/executor/tests/fixtures/responses/v1", dest: "fixtures/responses/v1" },
];

function parseArgs(): { core: string; rev: string | undefined } {
  const args = process.argv.slice(2);
  let core = path.resolve(REPO_ROOT, "..", "strata-core");
  let rev: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--core") core = path.resolve(String(args[++i]));
    else if (args[i] === "--rev") rev = String(args[++i]);
    else throw new Error(`unknown argument: ${args[i]}`);
  }
  return { core, rev };
}

function main(): void {
  const { core, rev: revArg } = parseArgs();
  if (!fs.existsSync(path.join(core, ".git"))) {
    throw new Error(`not a git checkout: ${core} (pass --core <path-to-strata-core>)`);
  }

  const requestedRev =
    revArg ??
    (fs.existsSync(REV_FILE) ? fs.readFileSync(REV_FILE, "utf8").trim() : undefined);
  if (!requestedRev) {
    throw new Error(`no pin recorded at ${REV_FILE}; pass --rev <sha> to establish one`);
  }

  const fullRev = execFileSync("git", ["-C", core, "rev-parse", `${requestedRev}^{commit}`], {
    encoding: "utf8",
  }).trim();

  // Extract via git archive into a staging dir, then move into place.
  const staging = fs.mkdtempSync(path.join(REPO_ROOT, ".vendor-staging-"));
  try {
    const tarFile = path.join(staging, "vendor.tar");
    const srcPaths = VENDOR_MAP.map((entry) => entry.src);
    const tar = execFileSync(
      "git",
      ["-C", core, "archive", "--format=tar", fullRev, "--", ...srcPaths],
      { maxBuffer: 512 * 1024 * 1024 },
    );
    fs.writeFileSync(tarFile, tar);
    execFileSync("tar", ["-xf", tarFile, "-C", staging]);

    for (const { src, dest } of VENDOR_MAP) {
      const from = path.join(staging, src);
      const to = path.join(IDL_DIR, dest);
      if (!fs.existsSync(from)) {
        throw new Error(`missing in strata-core@${fullRev.slice(0, 12)}: ${src}`);
      }
      fs.rmSync(to, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true });
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  fs.writeFileSync(REV_FILE, `${fullRev}\n`);
  console.log(`vendored idl/v1 from strata-core@${fullRev}`);
  console.log(`next: npm run generate`);
}

main();
