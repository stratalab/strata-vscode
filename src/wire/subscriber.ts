/**
 * The subscriber connection (AR-2.4, AR-5): hello with the notify.version
 * capability, one subscribe, then coalesced version ticks. Includes the
 * debounce/visibility policy (AR-5.4) and the bounded-backoff reconnect loop
 * (AR-8.2) with the re-read trigger (AR-5.3).
 */
import { WireConnection, type ConnectOptions } from "./connection";
import { HelloRefusedError, ProtocolViolationError, TransportError } from "./errors";
import {
  CAPABILITY_NOTIFY_VERSION,
  EVENT_VERSION,
  isNotifyFrame,
  isResponseFrame,
  type ServerHello,
} from "./protocol";

const SUBSCRIBE_ACK_TIMEOUT_MS = 5_000;

export class SubscriberSession {
  private readonly tickListeners: Array<(version: number) => void> = [];
  private readonly closeListeners: Array<(error?: Error) => void> = [];

  private constructor(private readonly connection: WireConnection) {
    connection.onFrame((frame) => {
      if (isNotifyFrame(frame) && frame.notify.event === EVENT_VERSION) {
        const version = typeof frame.notify.version === "number" ? frame.notify.version : 0;
        for (const listener of [...this.tickListeners]) listener(version);
      }
      // Unknown pushes are tolerated for forward compatibility (AR-6.2).
    });
    connection.onClose((error) => {
      for (const listener of [...this.closeListeners]) listener(error);
    });
  }

  static async connect(socketPath: string, options: ConnectOptions = {}): Promise<SubscriberSession> {
    const connection = await WireConnection.connect(socketPath, {
      ...options,
      access: "read",
      capabilities: [CAPABILITY_NOTIFY_VERSION],
    });

    // AR-5.1: subscribe immediately after the hello; the ack is correlated.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.destroy(new TransportError("no subscribe ack"));
        reject(new TransportError(`no subscribe ack within ${SUBSCRIBE_ACK_TIMEOUT_MS} ms`));
      }, SUBSCRIBE_ACK_TIMEOUT_MS);
      const stop = connection.onFrame((frame) => {
        if (!isResponseFrame(frame)) return;
        clearTimeout(timer);
        stop();
        if (
          frame.id === 1 &&
          "type" in frame.payload &&
          frame.payload.type === "ipc_subscribed"
        ) {
          resolve();
        } else {
          const violation = new ProtocolViolationError(
            `unexpected subscribe ack: ${JSON.stringify(frame)}`,
          );
          connection.destroy(violation);
          reject(violation);
        }
      });
      connection.onClose((error) => {
        clearTimeout(timer);
        reject(error ?? new TransportError("closed before subscribe ack"));
      });
      connection.send({ id: 1, subscribe: { events: [EVENT_VERSION] } });
    });

    return new SubscriberSession(connection);
  }

  get hello(): ServerHello {
    return this.connection.serverHello;
  }

  onTick(listener: (version: number) => void): () => void {
    this.tickListeners.push(listener);
    return () => {
      const at = this.tickListeners.indexOf(listener);
      if (at >= 0) this.tickListeners.splice(at, 1);
    };
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListeners.push(listener);
  }

  close(): void {
    this.connection.close();
  }
}

/**
 * AR-5.4: tick-driven refreshes are debounced (~200 ms, latest version wins)
 * and paused while no Strata view is visible — the subscription itself stays
 * open; only delivery is parked, and the latest version flushes on resume.
 */
export class TickDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: number | null = null;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly delayMs: number,
    private readonly deliver: (version: number) => void,
  ) {}

  push(version: number): void {
    if (this.disposed) return;
    this.latest = version;
    if (this.paused || this.timer !== null) return;
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  pause(): void {
    this.paused = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.latest !== null && this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.delayMs);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private flush(): void {
    this.timer = null;
    if (this.paused || this.disposed || this.latest === null) return;
    const version = this.latest;
    this.latest = null;
    this.deliver(version);
  }
}

/** Bounded exponential backoff for reconnects (AR-8.2). */
export class ExponentialBackoff {
  private attempt = 0;

  constructor(
    private readonly initialMs = 250,
    private readonly factor = 2,
    private readonly maxMs = 8_000,
  ) {}

  nextDelayMs(): number {
    const delay = Math.min(this.maxMs, this.initialMs * this.factor ** this.attempt);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}

export type SubscriberState = "connected" | "reconnecting" | "stopped" | "fatal";

export interface ReconnectingSubscriberOptions {
  backoff?: ExponentialBackoff;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Keeps a subscriber session alive across owner restarts and transport
 * errors. Emits `connected` after every (re)attach — the AR-5.3 re-read
 * trigger, because the tick stream carries no replay. A refused hello is
 * fatal (a version-mismatch state, never a retry loop — AR-2.3).
 */
export class ReconnectingSubscriber {
  private state: SubscriberState = "stopped";
  private session: SubscriberSession | null = null;
  private stopRequested = false;
  private readonly backoff: ExponentialBackoff;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly tickListeners: Array<(version: number) => void> = [];
  private readonly connectedListeners: Array<() => void> = [];
  private readonly stateListeners: Array<(state: SubscriberState, error?: Error) => void> = [];

  constructor(
    private readonly connect: () => Promise<SubscriberSession>,
    options: ReconnectingSubscriberOptions = {},
  ) {
    this.backoff = options.backoff ?? new ExponentialBackoff();
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  onTick(listener: (version: number) => void): void {
    this.tickListeners.push(listener);
  }

  /** Fires after every successful (re)attach — re-read visible state (AR-5.3). */
  onConnected(listener: () => void): void {
    this.connectedListeners.push(listener);
  }

  onStateChange(listener: (state: SubscriberState, error?: Error) => void): void {
    this.stateListeners.push(listener);
  }

  start(): void {
    if (this.state !== "stopped") return;
    this.stopRequested = false;
    void this.runLoop();
  }

  stop(): void {
    this.stopRequested = true;
    this.session?.close();
    this.session = null;
    this.setState("stopped");
  }

  private async runLoop(): Promise<void> {
    while (!this.stopRequested) {
      try {
        const session = await this.connect();
        if (this.stopRequested) {
          session.close();
          return;
        }
        this.session = session;
        this.backoff.reset();
        session.onTick((version) => {
          for (const listener of [...this.tickListeners]) listener(version);
        });
        const closed = new Promise<Error | undefined>((resolve) => session.onClose(resolve));
        this.setState("connected");
        for (const listener of [...this.connectedListeners]) listener();
        await closed;
        this.session = null;
        if (this.stopRequested) return;
        this.setState("reconnecting");
      } catch (error) {
        if (this.stopRequested) return;
        if (error instanceof HelloRefusedError) {
          this.setState("fatal", error);
          return;
        }
        this.setState("reconnecting", error as Error);
      }
      await this.sleep(this.backoff.nextDelayMs());
    }
  }

  private setState(state: SubscriberState, error?: Error): void {
    this.state = state;
    for (const listener of [...this.stateListeners]) listener(state, error);
  }

  get currentState(): SubscriberState {
    return this.state;
  }
}
