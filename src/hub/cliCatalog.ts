import { execFile } from "node:child_process";
import {
  firstJsonObject,
  HubApiError,
  type DatasetCard,
  type DatasetListParams,
  type DatasetListResponse,
  type HubInfo,
  type RefList,
} from "./catalog";

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
    const parsed = firstJsonObject(`${result.stdout}\n${result.stderr}`);
    if (parsed && typeof parsed.error === "object" && parsed.error !== null) {
      throw errorFromEnvelope(parsed.error as Record<string, unknown>);
    }
    if (result.exitCode !== 0) {
      throw new HubApiError(
        (result.stderr || result.stdout).trim().slice(0, 500) || "Strata hub command failed.",
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

function errorFromEnvelope(error: Record<string, unknown>): HubApiError {
  return new HubApiError(
    stringField(error, "message") ?? "Strata hub command failed.",
    null,
    stringField(error, "code"),
    error.retryable === true,
  );
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}
