import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { HubCliClient, supportsHubCliListParams } from "../../src/hub/cliCatalog";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svhubcli-"));
  dirs.push(dir);
  return dir;
}

function stubBinary(body: string): { bin: string; argsFile: string } {
  const dir = scratch();
  const bin = path.join(dir, "strata");
  const argsFile = path.join(dir, "args.txt");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
echo "$@" > ${argsFile}
${body}
`,
  );
  fs.chmodSync(bin, 0o755);
  return { bin, argsFile };
}

describe("Hub CLI catalog client", () => {
  it("reads hub info through the strata hub command", async () => {
    const { bin, argsFile } = stubBinary(
      `echo '{"type":"hub_info","data":{"protocol_version":"v1","server_implementation":"stratahub","server_version":"0.1.0","hash_algorithm":"blake3","max_object_size_bytes":1,"max_manifest_size_bytes":2,"max_dataset_size_bytes":3,"supported_object_content_types":["application/octet-stream"],"telemetry_endpoint_enabled":false}}'`,
    );

    const info = await new HubCliClient(bin, "https://hub.example/").info();

    expect(info.protocol_version).toBe("v1");
    expect(fs.readFileSync(argsFile, "utf8")).toContain("--json hub info --hub https://hub.example/");
  });

  it("passes list filters supported by the 1.2.1 CLI", async () => {
    const { bin, argsFile } = stubBinary(
      `echo '{"type":"hub_datasets","data":{"total":0,"offset":10,"limit":20,"items":[]}}'`,
    );

    const page = await new HubCliClient(bin, null).listDatasets({
      tasks: ["analytics"],
      tags: ["demo"],
      primitives: ["json"],
      license: "CC0-1.0",
      sizeMinBytes: 1,
      sizeMaxBytes: 100,
      sort: "recent",
      limit: 20,
      offset: 10,
    });

    expect(page.offset).toBe(10);
    expect(fs.readFileSync(argsFile, "utf8")).toContain(
      "--json hub list-datasets --task analytics --tag demo --primitive json --license CC0-1.0 --size-min-bytes 1 --size-max-bytes 100 --sort recent --limit 20 --offset 10",
    );
  });

  it("keeps query search on the direct HTTP path until the CLI exposes it", () => {
    expect(supportsHubCliListParams({ limit: 20 })).toBe(true);
    expect(supportsHubCliListParams({ query: "world bank", limit: 20 })).toBe(false);
  });

  it("maps CLI error envelopes into hub errors", async () => {
    const { bin } = stubBinary(
      `echo '{"error":{"code":"unavailable.executor.hub_transport","message":"hub offline","retryable":true}}'
exit 1`,
    );

    await expect(new HubCliClient(bin, null).getDataset("missing")).rejects.toMatchObject({
      code: "unavailable.executor.hub_transport",
      message: "hub offline",
      retryable: true,
    });
  });
});
