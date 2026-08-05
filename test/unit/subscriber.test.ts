/**
 * Subscriber, debouncer, and reconnect loop (AR-5, AR-8.2) against the fake
 * owner and with injected clocks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeServer } from "../harness/fakeServer";
import {
  ExponentialBackoff,
  ReconnectingSubscriber,
  SubscriberSession,
  TickDebouncer,
} from "../../src/wire/subscriber";
import { HelloRefusedError } from "../../src/wire/errors";

let server: FakeServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

function nextTick(session: SubscriberSession, timeoutMs = 2_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no tick")), timeoutMs);
    session.onTick((version) => {
      clearTimeout(timer);
      resolve(version);
    });
  });
}

describe("subscriber session", () => {
  it("subscribes after hello and delivers version ticks (AR-5.1)", async () => {
    server = await FakeServer.start();
    const session = await SubscriberSession.connect(server.socketPath);
    const tick = nextTick(session);
    server.notify(812);
    expect(await tick).toBe(812);
    session.close();
  });

  it("tolerates unknown push fields on ticks (AR-6.2)", async () => {
    server = await FakeServer.start();
    const session = await SubscriberSession.connect(server.socketPath);
    const tick = nextTick(session);
    server.sendRaw({ notify: { event: "version", version: 9, branch: "future-field" } });
    expect(await tick).toBe(9);
    session.close();
  });
});

describe("tick debouncer (AR-5.4)", () => {
  it("coalesces bursts, latest version wins", () => {
    vi.useFakeTimers();
    const delivered: number[] = [];
    const debouncer = new TickDebouncer(200, (v) => delivered.push(v));
    debouncer.push(1);
    debouncer.push(2);
    debouncer.push(3);
    vi.advanceTimersByTime(199);
    expect(delivered).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(delivered).toEqual([3]);
    vi.useRealTimers();
  });

  it("parks delivery while paused and flushes the latest on resume", () => {
    vi.useFakeTimers();
    const delivered: number[] = [];
    const debouncer = new TickDebouncer(200, (v) => delivered.push(v));
    debouncer.pause();
    debouncer.push(5);
    debouncer.push(8);
    vi.advanceTimersByTime(1_000);
    expect(delivered).toEqual([]); // no delivery while no view is visible
    debouncer.resume();
    vi.advanceTimersByTime(200);
    expect(delivered).toEqual([8]); // latest wins, nothing was lost
    vi.useRealTimers();
  });
});

describe("reconnect policy (AR-8.2)", () => {
  it("backs off exponentially to a bound and resets on success", () => {
    const backoff = new ExponentialBackoff(250, 2, 8_000);
    expect(backoff.nextDelayMs()).toBe(250);
    expect(backoff.nextDelayMs()).toBe(500);
    expect(backoff.nextDelayMs()).toBe(1_000);
    for (let i = 0; i < 10; i++) backoff.nextDelayMs();
    expect(backoff.nextDelayMs()).toBe(8_000);
    backoff.reset();
    expect(backoff.nextDelayMs()).toBe(250);
  });

  it("reconnects after failures and fires the re-read trigger per attach (AR-5.3)", async () => {
    server = await FakeServer.start();
    const socketPath = server.socketPath;
    let attempts = 0;
    const connected: number[] = [];
    const subscriber = new ReconnectingSubscriber(
      async () => {
        attempts += 1;
        if (attempts <= 2) throw new Error(`transient failure ${attempts}`);
        return SubscriberSession.connect(socketPath);
      },
      { sleep: () => Promise.resolve() },
    );
    subscriber.onConnected(() => connected.push(attempts));
    subscriber.start();
    await vi.waitFor(() => expect(subscriber.currentState).toBe("connected"));
    expect(attempts).toBe(3);
    expect(connected).toEqual([3]); // one re-read per successful attach
    subscriber.stop();
  });

  it("treats a refused hello as fatal, never a retry loop (AR-2.3)", async () => {
    const states: string[] = [];
    const subscriber = new ReconnectingSubscriber(
      async () => {
        throw new HelloRefusedError({ class: "invalid_argument", code: "invalid_argument.executor.ipc_hello" });
      },
      { sleep: () => Promise.resolve() },
    );
    subscriber.onStateChange((state) => states.push(state));
    subscriber.start();
    await vi.waitFor(() => expect(subscriber.currentState).toBe("fatal"));
    expect(states.filter((s) => s === "reconnecting")).toHaveLength(0);
    subscriber.stop();
  });
});
