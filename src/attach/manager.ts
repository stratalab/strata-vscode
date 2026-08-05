/**
 * The per-workspace database manager: discovery → attachment state (F1.6) →
 * live sessions (two fixed connections per database, AR-2.4) → tick-driven
 * refresh events. This module is vscode-free; the extension layer injects
 * configuration and subscribes to change events.
 */
import { InteractiveClient } from "../wire/client";
import { SubscriberSession, ReconnectingSubscriber, TickDebouncer } from "../wire/subscriber";
import type { ClientIdentity } from "../wire/protocol";
import { determineState, type AttachmentState, type SocketProbe, defaultProbe } from "./attachment";
import { findDatabases } from "./discovery";
import { resolveSocketPath } from "./socketDiscovery";
import { ManagedHostManager } from "./managedHost";

const TICK_DEBOUNCE_MS = 200;

export interface DatabaseEntry {
  dbPath: string;
  state: AttachmentState;
  managed: boolean;
}

export interface ManagerConfig {
  workspaceRoots: string[];
  explicitDatabases: string[];
  identity: ClientIdentity;
  probe?: SocketProbe;
}

/** A live attachment: interactive client + reconnecting subscriber (AR-2.4). */
export class DatabaseSession {
  private readonly refreshListeners: Array<() => void> = [];
  private readonly lostListeners: Array<() => void> = [];
  private readonly debouncer: TickDebouncer;
  readonly subscriber: ReconnectingSubscriber;
  closed = false;

  private constructor(
    readonly dbPath: string,
    readonly client: InteractiveClient,
    socketResolver: () => string | null,
    identity: ClientIdentity,
  ) {
    this.debouncer = new TickDebouncer(TICK_DEBOUNCE_MS, () => this.emitRefresh());
    this.subscriber = new ReconnectingSubscriber(async () => {
      const socketPath = socketResolver();
      if (!socketPath) throw new Error("socket gone");
      return SubscriberSession.connect(socketPath, { identity });
    });
    this.subscriber.onTick((version) => this.debouncer.push(version));
    // AR-5.3: every (re)attach re-reads once — the tick stream has no replay.
    this.subscriber.onConnected(() => this.emitRefresh());
    this.subscriber.start();
  }

  static async attach(dbPath: string, socketPath: string, identity: ClientIdentity): Promise<DatabaseSession> {
    const client = await InteractiveClient.connect(socketPath, { identity });
    const session = new DatabaseSession(dbPath, client, () => resolveSocketPath(dbPath), identity);
    client.onClose((error) => {
      if (error && !session.closed) session.notifyConnectionLost();
    });
    return session;
  }

  /** Fires debounced on ticks and once per subscriber (re)attach. */
  onRefresh(listener: () => void): void {
    this.refreshListeners.push(listener);
  }

  /** Fires when the interactive connection dies (owner death, AR-8.2). */
  onConnectionLost(listener: () => void): void {
    this.lostListeners.push(listener);
  }

  /** AR-5.4: delivery pauses while no Strata view is visible. */
  setVisible(visible: boolean): void {
    if (visible) this.debouncer.resume();
    else this.debouncer.pause();
  }

  notifyConnectionLost(): void {
    for (const listener of [...this.lostListeners]) listener();
  }

  private emitRefresh(): void {
    if (this.closed) return;
    for (const listener of [...this.refreshListeners]) listener();
  }

  close(): void {
    this.closed = true;
    this.debouncer.dispose();
    this.subscriber.stop();
    this.client.close();
  }
}

export class DatabaseManager {
  private entries = new Map<string, DatabaseEntry>();
  private sessions = new Map<string, DatabaseSession>();
  private readonly changeListeners: Array<(dbPath?: string) => void> = [];
  private visible = true;
  private tickGate: (dbPath: string) => boolean = () => true;

  constructor(
    private readonly config: ManagerConfig,
    readonly hosts: ManagedHostManager,
  ) {}

  onDidChange(listener: (dbPath?: string) => void): void {
    this.changeListeners.push(listener);
  }

  list(): DatabaseEntry[] {
    return [...this.entries.values()].sort((a, b) => a.dbPath.localeCompare(b.dbPath));
  }

  session(dbPath: string): DatabaseSession | undefined {
    return this.sessions.get(dbPath);
  }

  /** Full pass: discover, probe, attach what answers (AR-3.1 attach-first). */
  async refresh(): Promise<void> {
    const found = findDatabases(this.config.workspaceRoots, this.config.explicitDatabases);
    for (const known of [...this.entries.keys()]) {
      if (!found.includes(known)) {
        this.dropSession(known);
        this.entries.delete(known);
      }
    }
    for (const dbPath of found) {
      await this.refreshOne(dbPath);
    }
    this.emitChange();
  }

  /** Re-probes one database and (re)attaches when a socket answers (AR-8.2). */
  async refreshOne(dbPath: string): Promise<DatabaseEntry> {
    const state = await determineState(dbPath, this.config.probe ?? defaultProbe);
    const entry: DatabaseEntry = {
      dbPath,
      state,
      managed: this.hosts.isManaged(dbPath),
    };
    this.entries.set(dbPath, entry);

    if (state.kind === "attachable" && !this.sessions.has(dbPath)) {
      try {
        const session = await DatabaseSession.attach(dbPath, state.socketPath, this.config.identity);
        session.setVisible(this.visible);
        // F2.2: tick-driven refresh is suspended while scrubbed into the
        // past — the subscription stays open; only delivery is gated.
        session.onRefresh(() => {
          if (this.tickGate(dbPath)) this.emitChange(dbPath);
        });
        session.onConnectionLost(() => {
          this.dropSession(dbPath);
          // AR-8.2: rediscover and reattach; the state machine decides what
          // the user sees (unowned → start-host offer, etc.).
          void this.refreshOne(dbPath).then(() => this.emitChange(dbPath));
        });
        this.sessions.set(dbPath, session);
      } catch {
        // The socket vanished between probe and attach — re-probe.
        const reprobe = await determineState(dbPath, this.config.probe ?? defaultProbe);
        this.entries.set(dbPath, { ...entry, state: reprobe });
      }
    } else if (state.kind !== "attachable") {
      this.dropSession(dbPath);
    }
    this.emitChange(dbPath);
    return this.entries.get(dbPath)!;
  }

  /** Starts a managed host for an unowned database, then attaches (AR-3.2). */
  async startHost(dbPath: string): Promise<DatabaseEntry> {
    await this.hosts.startHost(dbPath);
    return this.refreshOne(dbPath);
  }

  async stopHost(dbPath: string): Promise<DatabaseEntry> {
    this.dropSession(dbPath);
    await this.hosts.stopHost(dbPath);
    return this.refreshOne(dbPath);
  }

  /** F2.2: lets the view context suspend tick refresh for scrubbed databases. */
  setTickGate(gate: (dbPath: string) => boolean): void {
    this.tickGate = gate;
  }

  /** Manual change broadcast — used when leaving a scrub position ("back to now"). */
  poke(dbPath?: string): void {
    this.emitChange(dbPath);
  }

  /** AR-5.4: view visibility gates tick delivery, not the subscriptions. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const session of this.sessions.values()) session.setVisible(visible);
  }

  private dropSession(dbPath: string): void {
    this.sessions.get(dbPath)?.close();
    this.sessions.delete(dbPath);
  }

  private emitChange(dbPath?: string): void {
    for (const listener of [...this.changeListeners]) listener(dbPath);
  }

  async dispose(): Promise<void> {
    for (const dbPath of [...this.sessions.keys()]) this.dropSession(dbPath);
    // AR-8.4: deactivation stops managed hosts; read-only means nothing to flush.
    await this.hosts.stopAll();
  }
}
