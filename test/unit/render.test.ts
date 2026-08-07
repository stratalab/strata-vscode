/**
 * Pure rendering: byte previews (never guess silently), copy-as forms
 * (F1.3), and the status bar model (AR-3.5).
 */
import { describe, expect, it } from "vitest";
import { decodeValue, keyLabel, keyText, previewValue } from "../../src/explorer/decode";
import { copyAsCli, copyAsWireJson } from "../../src/explorer/copyAs";
import { renderStatus, sparkline } from "../../src/ui/statusModel";
import { encodeBytes, encodeUtf8 } from "../../src/wire/bytes";

describe("byte decoding", () => {
  it("detects text, json, and binary — and says which (never silent)", () => {
    expect(decodeValue(encodeUtf8("hello"))).toMatchObject({ form: "text", display: "hello" });
    expect(decodeValue(encodeUtf8('{"a":1}'))).toMatchObject({ form: "json" });
    const binary = decodeValue(encodeBytes(new Uint8Array([0, 1, 255])));
    expect(binary.form).toBe("binary");
    expect(binary.display).toBe("0001ff");
    expect(previewValue(encodeBytes(new Uint8Array([0, 1, 255])))).toContain("(3 B)");
  });

  it("labels non-text keys as hex, and withholds their CLI text form", () => {
    expect(keyLabel(encodeUtf8("user:1"))).toBe("user:1");
    expect(keyText(encodeUtf8("user:1"))).toBe("user:1");
    const raw = encodeBytes(new Uint8Array([0, 159]));
    expect(keyLabel(raw)).toMatch(/^0x/);
    expect(keyText(raw)).toBeNull();
  });

  it("caps previews", () => {
    const long = previewValue(encodeUtf8("x".repeat(500)));
    expect(long.length).toBeLessThan(100);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("copy-as forms (F1.3)", () => {
  it("renders the wire request that reproduces a kv read", () => {
    const text = copyAsWireJson("kv.get", { key: encodeUtf8("hi") }, { branch: "default", space: "default" });
    const parsed = JSON.parse(text) as { branch: string; command: { type: string; key: string } };
    expect(parsed.command).toEqual({ type: "kv_get", key: "aGk=" });
    expect(parsed.branch).toBe("default");
  });

  it("renders the CLI form with plain text and scope flags, or refuses", () => {
    expect(copyAsCli("kv.get", ["hi"], { branch: "default", space: "default" })).toBe("strata kv get hi");
    expect(copyAsCli("kv.get", ["needs quoting!"], { branch: "feature", space: "default" })).toBe(
      "strata kv get 'needs quoting!' --branch feature",
    );
    // Non-text bytes have no CLI form (AR-1.7 boundary honesty).
    expect(copyAsCli("kv.get", [null], { branch: "default" })).toBeNull();
  });
});

describe("status bar model (AR-3.5)", () => {
  const self = { name: "strata-vscode", version: "0.1.0", pid: 4242 };

  it("renders owner facts and the client list with self highlighted", () => {
    const rendered = renderStatus(
      [
        {
          dbPath: "/w/db",
          stateDescription: "attachable",
          ipcStatus: {
            client_count: 3,
            hosting: true,
            is_owner: true,
            owner_pid: 1234,
            socket_path: "/w/db/strata.sock",
            clients: [
              { access: "read", name: "strata-vscode", version: "0.1.0", pid: 4242, protocol: 2 },
              { access: "read_write", name: "strata", version: "1.0.0", pid: 777, protocol: 2 },
              { access: "read_write", protocol: 1 },
            ],
          },
        },
      ],
      self,
    );
    expect(rendered.text).toBe("$(database) StrataDB: 1 attached");
    expect(rendered.visible).toBe(true);
    expect(rendered.warning).toBe(false);
    expect(rendered.tooltipMarkdown).toContain("owner pid 1234");
    expect(rendered.tooltipMarkdown).toContain("3 clients");
    expect(rendered.tooltipMarkdown).toContain("**strata-vscode 0.1.0** ← this window");
    expect(rendered.tooltipMarkdown).toContain("| 4242 |");
    expect(rendered.tooltipMarkdown).toContain("unidentified client");
  });

  it("renders unattached databases without inventing facts", () => {
    const rendered = renderStatus([{ dbPath: "/w/db", stateDescription: "unowned" }], self);
    expect(rendered.text).toBe("$(database) StrataDB");
    expect(rendered.tooltipMarkdown).toContain("unowned");
  });

  it("hides when there is nothing to say (SB-1)", () => {
    expect(renderStatus([], self).visible).toBe(false);
  });

  it("renders a change-rate sparkline when there is activity (U11)", () => {
    expect(sparkline([0, 0, 0, 0])).toBe("▁▁▁▁");
    expect(sparkline([0, 1, 4, 8])).toBe("▁▂▅█");
    const rendered = renderStatus(
      [{ dbPath: "/w/db", stateDescription: "attachable", activity: [0, 0, 1, 3, 0, 0, 2, 8] }],
      self,
    );
    expect(rendered.tooltipMarkdown).toContain("changes/min, last 8m");
    expect(rendered.tooltipMarkdown).toContain("▁▁▂▄▁▁▃█");
    // Silence earns no line.
    const quiet = renderStatus(
      [{ dbPath: "/w/db", stateDescription: "attachable", activity: [0, 0, 0, 0, 0, 0, 0, 0] }],
      self,
    );
    expect(quiet.tooltipMarkdown).not.toContain("changes/min");
  });

  it("wears the history state when any database is scrubbed (SB-1/SIG-2)", () => {
    const rendered = renderStatus(
      [{ dbPath: "/w/db", stateDescription: "attachable", scrubbedTo: "Aug 5, 2026, 14:12:00" }],
      self,
    );
    expect(rendered.warning).toBe(true);
    expect(rendered.text).toBe("$(history) StrataDB · as of Aug 5, 2026, 14:12:00");
    expect(rendered.tooltipMarkdown).toContain("live refresh suspended");
  });
});
