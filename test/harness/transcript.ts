/**
 * Wire transcript recorder (E3): captures the frames a session exchanges so
 * UI logic can be tested against recorded reality instead of a live host
 * (N7: "UI logic is tested against recorded wire transcripts").
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface TranscriptEntry {
  direction: "send" | "recv";
  frame: unknown;
}

export class TranscriptRecorder {
  readonly entries: TranscriptEntry[] = [];

  record(direction: TranscriptEntry["direction"], frame: unknown): void {
    // Deep-copy so later mutation of a shared frame object cannot rewrite history.
    this.entries.push({ direction, frame: JSON.parse(JSON.stringify(frame)) as unknown });
  }

  saveSync(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.entries, null, 2) + "\n");
  }

  static loadSync(filePath: string): TranscriptEntry[] {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as TranscriptEntry[];
  }
}
