import * as vscode from "vscode";
import type { DatabaseManager } from "../attach/manager";
import type { ViewContextStore } from "../state/viewContext";
import type { ExplorerNode } from "../explorer/model";
import type { BranchItem } from "../generated";
import { branchHandoffPrompt, type AgentScope } from "../agent/helpers";
import { runStrataJson, StrataCliCommandError } from "../cli/run";
import { renderBranchDiffDocument, summarizeBranchDiff } from "../branch/render";
import type { InspectorDocuments } from "./inspectorDoc";

type NodeScope = { dbPath: string; branch: string; space: string };

export class BranchWorkflowUi {
  constructor(
    private readonly binary: string | null,
    private readonly manager: DatabaseManager,
    private readonly viewContext: ViewContextStore,
    private readonly inspectors: InspectorDocuments,
    private readonly openBranchSpace: (dbPath: string, branch: string, space: string) => void,
  ) {}

  async forkBranchFlow(node?: ExplorerNode): Promise<void> {
    if (!this.requireWritable("Forking a branch executes the strata binary")) return;
    const scope = await this.scopeFor(node);
    if (!scope) return;
    const source = scope.branch;
    const branch = await vscode.window.showInputBox({
      title: `Fork ${source}`,
      prompt: "Name the experiment branch. The source branch keeps serving existing apps and agents.",
      value: suggestedBranchName(source),
      validateInput: (value) => validateBranchName(value, source),
    });
    if (branch === undefined) return;
    const branchName = branch.trim();

    const asOf = this.viewContext.asOfFor(scope.dbPath);
    let timestamp: number | null = null;
    if (asOf !== null) {
      const point = await vscode.window.showQuickPick(
        [
          { label: "$(git-commit) Fork live head", description: `${source} now`, timestamp: null },
          { label: "$(history) Fork viewed timestamp", description: this.viewContext.describeAsOf(scope.dbPath) ?? String(asOf), timestamp: asOf },
        ],
        { title: "Choose fork point" },
      );
      if (!point) return;
      timestamp = point.timestamp;
    }

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Forking ${source} to ${branchName}...` },
        () => this.runFork(scope.dbPath, source, branchName, timestamp),
      );
      this.viewContext.setBranch(scope.dbPath, branchName);
      await this.manager.refreshOne(scope.dbPath);
      const choice = await vscode.window.showInformationMessage(
        `StrataDB: forked ${source} to ${branchName}.`,
        "Open Branch",
        "Copy Agent Handoff",
        "Diff from Source",
      );
      if (choice === "Open Branch") {
        this.openBranchSpace(scope.dbPath, branchName, scope.space);
      } else if (choice === "Copy Agent Handoff") {
        await this.copyHandoff({ dbPath: scope.dbPath, branch: branchName, space: scope.space });
      } else if (choice === "Diff from Source") {
        await this.openBranchDiff(scope.dbPath, source, branchName);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`StrataDB: fork failed - ${formatError(error)}`);
    }
  }

  async diffBranchesFlow(node?: ExplorerNode): Promise<void> {
    const scope = await this.scopeFor(node);
    if (!scope) return;
    const branches = await this.listBranches(scope.dbPath);
    if (branches.length < 2) {
      void vscode.window.showInformationMessage("StrataDB: only one branch exists - nothing to diff.");
      return;
    }
    const branchA = await this.pickBranch(scope.dbPath, branches, "Diff from branch", scope.branch);
    if (!branchA) return;
    const branchB = await this.pickBranch(
      scope.dbPath,
      branches.filter((branch) => branch.name !== branchA),
      `Diff ${branchA} against`,
    );
    if (!branchB) return;
    await this.openBranchDiff(scope.dbPath, branchA, branchB);
  }

  async copyBranchHandoffFlow(node?: ExplorerNode): Promise<void> {
    const scope = await this.scopeFor(node);
    if (!scope) return;
    await this.copyHandoff(scope);
  }

  async openBranchDiff(dbPath: string, branchA: string, branchB: string): Promise<void> {
    const session = this.manager.session(dbPath);
    if (!session) {
      void vscode.window.showWarningMessage("StrataDB: connect the database before diffing branches.");
      return;
    }
    const asOf = this.viewContext.asOfFor(dbPath);
    try {
      const response = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Diffing ${branchA} to ${branchB}...` },
        () =>
          session.client.request(
            "branch.diff",
            {
              branch_a: branchA,
              branch_b: branchB,
              ...(asOf !== null ? { at_timestamp: asOf } : {}),
            },
            { branch: branchA, requestClass: "expensive" },
          ),
      );
      const summary = summarizeBranchDiff(response.data);
      await this.inspectors.open(
        `branch diff ${branchA} to ${branchB}`,
        renderBranchDiffDocument(dbPath, response.data, asOf),
      );
      const noun = summary.total === 1 ? "difference" : "differences";
      void vscode.window.setStatusBarMessage(`StrataDB: ${summary.total} ${noun} across ${summary.spaces} groups`, 3_000);
    } catch (error) {
      void vscode.window.showErrorMessage(`StrataDB: branch diff failed - ${formatError(error)}`);
    }
  }

  private async runFork(dbPath: string, source: string, branch: string, timestamp: number | null): Promise<unknown> {
    const args = ["--db", dbPath, "--json", "branch", "fork", source, branch];
    if (timestamp !== null) args.push("--timestamp", String(timestamp));
    return runStrataJson(this.binary!, args, 30_000);
  }

  private async scopeFor(node?: ExplorerNode): Promise<NodeScope | null> {
    const direct = node ? scopeFromNode(node, this.viewContext) : null;
    if (direct) return direct;

    const connected = this.manager.list().filter((entry) => this.manager.session(entry.dbPath));
    if (connected.length === 0) {
      void vscode.window.showWarningMessage("StrataDB: connect a database first.");
      return null;
    }
    const dbPath =
      connected.length === 1
        ? connected[0]!.dbPath
        : (await vscode.window.showQuickPick(
            connected.map((entry) => ({
              label: entry.dbPath.split("/").filter(Boolean).pop() ?? entry.dbPath,
              description: entry.dbPath,
            })),
            { title: "Choose database" },
          ))?.description;
    if (!dbPath) return null;
    const branches = await this.listBranches(dbPath);
    const branch = branches.length > 1
      ? await this.pickBranch(dbPath, branches, "Choose branch", this.viewContext.branchFor(dbPath))
      : branches[0]?.name ?? this.viewContext.branchFor(dbPath);
    if (!branch) return null;
    return { dbPath, branch, space: "default" };
  }

  private async listBranches(dbPath: string): Promise<BranchItem[]> {
    const session = this.manager.session(dbPath);
    if (!session) {
      void vscode.window.showWarningMessage("StrataDB: connect the database first.");
      return [];
    }
    const current = this.viewContext.branchFor(dbPath);
    const response = await session.client.request("branch.list", {}, { branch: current });
    return response.data.items;
  }

  private async pickBranch(
    dbPath: string,
    branches: BranchItem[],
    title: string,
    preferred?: string,
  ): Promise<string | null> {
    const picked = await vscode.window.showQuickPick(
      branches.map((branch) => ({
        label: `$(git-branch) ${branch.name}`,
        description: [
          branch.status,
          branch.name === preferred ? "current" : null,
          branch.parent ? `forked from ${branch.parent.name}` : null,
        ].filter(Boolean).join(" - "),
        branch: branch.name,
        picked: branch.name === preferred,
      })),
      { title: `${title} - ${dbPath.split("/").filter(Boolean).pop() ?? dbPath}` },
    );
    return picked?.branch ?? null;
  }

  private async copyHandoff(scope: AgentScope): Promise<void> {
    await vscode.env.clipboard.writeText(branchHandoffPrompt(scope));
    void vscode.window.setStatusBarMessage(`StrataDB: agent handoff copied for ${scope.branch}`, 2_000);
  }

  private requireWritable(reason: string): boolean {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(`StrataDB: ${reason} and is disabled in untrusted workspaces.`);
      return false;
    }
    if (!this.binary) {
      void vscode.window.showWarningMessage("StrataDB: no strata binary - set strata.binaryPath.");
      return false;
    }
    return true;
  }
}

function scopeFromNode(node: ExplorerNode, viewContext: ViewContextStore): NodeScope | null {
  if (node.type === "database") {
    return { dbPath: node.dbPath, branch: viewContext.branchFor(node.dbPath), space: "default" };
  }
  if (node.type === "branch") return { dbPath: node.dbPath, branch: node.branch, space: "default" };
  if (node.type === "space") return { dbPath: node.dbPath, branch: node.branch, space: node.space };
  if ("scope" in node) return node.scope;
  return null;
}

function suggestedBranchName(source: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${source === "default" ? "experiment" : `${source}-experiment`}-${stamp}`;
}

function validateBranchName(value: string, source: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Branch name is required.";
  if (trimmed === source) return "New branch must have a different name.";
  if (/\s/.test(trimmed)) return "Use a branch name without spaces.";
  return null;
}

function formatError(error: unknown): string {
  if (error instanceof StrataCliCommandError) {
    return `${error.details.code}: ${error.details.message}${error.details.suggestedFix ? ` (${error.details.suggestedFix})` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
