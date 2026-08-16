import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

interface SortRecord {
  key: string;
  value: string;
}

interface RunState {
  iterator: AsyncIterator<string>;
  current: SortRecord;
  runIndex: number;
}

function compare(left: SortRecord, right: SortRecord): number {
  if (left.key < right.key) return -1;
  if (left.key > right.key) return 1;
  return 0;
}

function parseRunRecord(line: string): SortRecord {
  const parsed = JSON.parse(line) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "string" ||
    typeof parsed[1] !== "string"
  ) {
    throw new Error("Source slice sort run is corrupt.");
  }
  return { key: parsed[0], value: parsed[1] };
}

export class ExternalStringSorter {
  private readonly records: SortRecord[] = [];
  private readonly runPaths: string[] = [];
  private bufferedBytes = 0;

  constructor(
    private readonly workDirectory: string,
    private readonly maxBufferedBytes = 16 * 1024 * 1024,
  ) {}

  async add(key: string, value: string): Promise<void> {
    this.records.push({ key, value });
    this.bufferedBytes += Buffer.byteLength(key) + Buffer.byteLength(value) + 8;
    if (this.bufferedBytes >= this.maxBufferedBytes) await this.flushRun();
  }

  private async flushRun(): Promise<void> {
    if (this.records.length === 0) return;
    this.records.sort(compare);
    await mkdir(this.workDirectory, { recursive: true });
    const path = join(
      this.workDirectory,
      `run-${String(this.runPaths.length).padStart(6, "0")}.jsonl`,
    );
    const bytes = `${this.records
      .map((record) => JSON.stringify([record.key, record.value]))
      .join("\n")}\n`;
    await writeFile(path, bytes, { flag: "wx" });
    this.runPaths.push(path);
    this.records.length = 0;
    this.bufferedBytes = 0;
  }

  async *values(): AsyncGenerator<string> {
    await this.flushRun();
    const states: RunState[] = [];
    for (const [runIndex, path] of this.runPaths.entries()) {
      const iterator = createInterface({
        input: createReadStream(path),
        crlfDelay: Infinity,
      })[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (!first.done) {
        states.push({
          iterator,
          current: parseRunRecord(first.value),
          runIndex,
        });
      }
    }

    while (states.length > 0) {
      let minimumIndex = 0;
      for (let index = 1; index < states.length; index += 1) {
        const order = compare(
          states[index]!.current,
          states[minimumIndex]!.current,
        );
        if (
          order < 0 ||
          (order === 0 &&
            states[index]!.runIndex < states[minimumIndex]!.runIndex)
        ) {
          minimumIndex = index;
        }
      }
      const state = states[minimumIndex]!;
      yield state.current.value;
      const next = await state.iterator.next();
      if (next.done) states.splice(minimumIndex, 1);
      else state.current = parseRunRecord(next.value);
    }
  }
}
