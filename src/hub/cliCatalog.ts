import { execFile } from "node:child_process";
import {
  HubApiError,
  type DatasetCard,
  type DatasetListParams,
  type DatasetListResponse,
  type HubInfo,
  type RefList,
} from "./catalog";
import { cliErrorFromEnvelope, firstCliJsonObject, outputSnippet } from "../cli/envelope";

const HUB_CLI_TIMEOUT_MS = 15_000;
const HUB_CLI_MAX_BUFFER = 2 * 1024 * 1024;

export class HubCliClient {
  constructor(
    private readonly binary: string,
    private readonly hubUrl: string | null,
    private readonly timeoutMs = HUB_CLI_TIMEOUT_MS,
  ) {}

  info(): Promise<HubInfo> {
    return this.runData<HubInfo>(["hub", "info"]);
  }

  listDatasets(params: DatasetListParams): Promise<DatasetListResponse> {
    return this.runData<DatasetListResponse>(["hub", "list-datasets", ...listArgs(params)]);
  }

  getDataset(name: string): Promise<DatasetCard> {
    return this.runData<DatasetCard>(["hub", "get-dataset", name]);
  }

  listRefs(name: string): Promise<RefList> {
    return this.runData<RefList>(["hub", "list-refs", name]);
  }

  private async runData<T>(args: string[]): Promise<T> {
    const cliArgs = ["--json", ...args, ...(this.hubUrl ? ["--hub", this.hubUrl] : [])];
    const result = await execFileResult(this.binary, cliArgs, this.timeoutMs);
    const parsed = firstCliJsonObject(result.stdout, result.stderr);
    const envelopeError = cliErrorFromEnvelope(parsed);
    if (envelopeError) {
      throw new HubApiError(envelopeError.message, null, envelopeError.code, envelopeError.retryable);
    }
    if (result.exitCode !== 0) {
      throw new HubApiError(
        outputSnippet(result.stdout, result.stderr, 500) || "Strata hub command failed.",
        null,
        result.timedOut ? "client.hub_cli_timeout" : "client.hub_cli_failed",
        true,
      );
    }
    if (!parsed || !("data" in parsed)) {
      throw new HubApiError("Strata hub command produced no JSON data.", null, "client.hub_cli_output_unparseable", true);
    }
    return parsed.data as T;
  }
}

export function supportsHubCliListParams(params: DatasetListParams): boolean {
  return !params.query?.trim();
}

function listArgs(params: DatasetListParams): string[] {
  const args: string[] = [];
  for (const task of params.tasks ?? []) if (task) args.push("--task", task);
  for (const tag of params.tags ?? []) if (tag) args.push("--tag", tag);
  for (const primitive of params.primitives ?? []) args.push("--primitive", primitive);
  if (params.license) args.push("--license", params.license);
  if (params.sizeMinBytes !== undefined && params.sizeMinBytes !== null) {
    args.push("--size-min-bytes", String(params.sizeMinBytes));
  }
  if (params.sizeMaxBytes !== undefined && params.sizeMaxBytes !== null) {
    args.push("--size-max-bytes", String(params.sizeMaxBytes));
  }
  if (params.sort) args.push("--sort", params.sort);
  if (params.limit !== undefined) args.push("--limit", String(params.limit));
  if (params.offset !== undefined) args.push("--offset", String(params.offset));
  return args;
}

function execFileResult(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, maxBuffer: HUB_CLI_MAX_BUFFER },
      (error, stdout, stderr) => {
        const maybeError = error as
          | (Error & { code?: number | string | null; signal?: NodeJS.Signals | null; killed?: boolean })
          | null;
        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          exitCode: typeof maybeError?.code === "number" ? maybeError.code : error ? 1 : 0,
          timedOut: maybeError?.killed === true || maybeError?.signal === "SIGTERM",
        });
      },
    );
  });
}
