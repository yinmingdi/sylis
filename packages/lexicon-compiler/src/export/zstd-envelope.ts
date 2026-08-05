import { createReadStream } from "node:fs";
import { Duplex, Transform } from "node:stream";
import { constants, createZstdCompress, type ZstdOptions } from "node:zlib";

const ZSTD_FRAME_MAGIC = 0xfd2fb528;
const ZSTD_SKIPPABLE_MAGIC_MIN = 0x184d2a50;
const ZSTD_SKIPPABLE_MAGIC_MAX = 0x184d2a5f;
const MAX_BLOCK_SIZE = 128 * 1024;
const EMPTY_CHECKSUMMED_FRAME = Buffer.from([
  0x28, 0xb5, 0x2f, 0xfd, 0x24, 0x00, 0x01, 0x00, 0x00, 0x99, 0xe9, 0xd8, 0x51,
]);

const COMPRESSION_OPTIONS: ZstdOptions = {
  params: {
    [constants.ZSTD_c_checksumFlag]: 1,
  },
};

type ScannerState =
  | "MAGIC"
  | "FRAME_DESCRIPTOR"
  | "FRAME_HEADER"
  | "BLOCK_HEADER"
  | "BLOCK_PAYLOAD"
  | "CHECKSUM"
  | "DONE";

export interface ZstdEnvelopeInspection {
  compressedBytes: number;
}

// Node 24 appends this empty frame when a Zstd stream receives multiple writes.
class StripNodeTrailingEmptyFrame extends Transform {
  #tail = Buffer.alloc(0);
  #totalBytes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const bytes = Buffer.from(chunk);
    this.#totalBytes += bytes.length;
    const combined = Buffer.concat([this.#tail, bytes]);
    if (combined.length <= EMPTY_CHECKSUMMED_FRAME.length) {
      this.#tail = combined;
      callback();
      return;
    }
    const emitBytes = combined.length - EMPTY_CHECKSUMMED_FRAME.length;
    this.push(combined.subarray(0, emitBytes));
    this.#tail = combined.subarray(emitBytes);
    callback();
  }

  override _flush(callback: (error?: Error | null) => void): void {
    if (
      this.#totalBytes <= EMPTY_CHECKSUMMED_FRAME.length ||
      !this.#tail.equals(EMPTY_CHECKSUMMED_FRAME)
    ) {
      this.push(this.#tail);
    }
    callback();
  }
}

export function createSingleFrameZstdCompress(): Duplex {
  const compressor = createZstdCompress(COMPRESSION_OPTIONS);
  const output = compressor.pipe(new StripNodeTrailingEmptyFrame());
  return Duplex.from({ writable: compressor, readable: output });
}

class SingleFrameScanner {
  #state: ScannerState = "MAGIC";
  #buffer: Buffer = Buffer.alloc(0);
  #frameHeaderBytes = 0;
  #blockPayloadBytes = 0;
  #lastBlock = false;
  #hasChecksum = false;
  #compressedBytes = 0;

  constructor(private readonly maxCompressedBytes: number) {}

  accept(chunk: Buffer): void {
    this.#compressedBytes += chunk.length;
    if (this.#compressedBytes > this.maxCompressedBytes) {
      throw new Error("Artifact exceeds compressed byte limit.");
    }
    if (chunk.length === 0) return;
    if (this.#state === "DONE") {
      throw new Error(
        "Artifact contains trailing data or multiple zstd frames.",
      );
    }
    this.#buffer =
      this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    while (this.#advance()) {
      // Continue while the buffered chunk contains another complete field.
    }
  }

  finish(): ZstdEnvelopeInspection {
    if (this.#state !== "DONE" || this.#buffer.length !== 0) {
      throw new Error("Artifact contains a truncated zstd frame.");
    }
    return { compressedBytes: this.#compressedBytes };
  }

  #advance(): boolean {
    switch (this.#state) {
      case "MAGIC": {
        const field = this.#take(4);
        if (!field) return false;
        const magic = field.readUInt32LE(0);
        if (
          magic >= ZSTD_SKIPPABLE_MAGIC_MIN &&
          magic <= ZSTD_SKIPPABLE_MAGIC_MAX
        ) {
          throw new Error("Artifact must not contain a skippable zstd frame.");
        }
        if (magic !== ZSTD_FRAME_MAGIC) {
          throw new Error(
            "Artifact does not begin with a standard zstd frame.",
          );
        }
        this.#state = "FRAME_DESCRIPTOR";
        return true;
      }
      case "FRAME_DESCRIPTOR": {
        const field = this.#take(1);
        if (!field) return false;
        const descriptor = field[0]!;
        if ((descriptor & 0x18) !== 0) {
          throw new Error("Artifact zstd frame uses reserved header bits.");
        }
        const contentSizeFlag = descriptor >>> 6;
        const singleSegment = (descriptor & 0x20) !== 0;
        const dictionaryIdFlag = descriptor & 0x03;
        this.#hasChecksum = (descriptor & 0x04) !== 0;
        const dictionaryIdBytes = [0, 1, 2, 4][dictionaryIdFlag]!;
        const contentSizeBytes =
          contentSizeFlag === 0
            ? singleSegment
              ? 1
              : 0
            : [0, 2, 4, 8][contentSizeFlag]!;
        this.#frameHeaderBytes =
          (singleSegment ? 0 : 1) + dictionaryIdBytes + contentSizeBytes;
        this.#state = "FRAME_HEADER";
        return true;
      }
      case "FRAME_HEADER": {
        const field = this.#take(this.#frameHeaderBytes);
        if (!field) return false;
        this.#state = "BLOCK_HEADER";
        return true;
      }
      case "BLOCK_HEADER": {
        const field = this.#take(3);
        if (!field) return false;
        const header = field.readUIntLE(0, 3);
        this.#lastBlock = (header & 0x01) !== 0;
        const blockType = (header >>> 1) & 0x03;
        const blockSize = header >>> 3;
        if (blockType === 3) {
          throw new Error(
            "Artifact zstd frame contains a reserved block type.",
          );
        }
        if (blockSize > MAX_BLOCK_SIZE) {
          throw new Error("Artifact zstd frame contains an oversized block.");
        }
        this.#blockPayloadBytes = blockType === 1 ? 1 : blockSize;
        this.#state = "BLOCK_PAYLOAD";
        return true;
      }
      case "BLOCK_PAYLOAD": {
        if (this.#buffer.length < this.#blockPayloadBytes) {
          this.#blockPayloadBytes -= this.#buffer.length;
          this.#buffer = Buffer.alloc(0);
          return false;
        }
        this.#buffer = this.#buffer.subarray(this.#blockPayloadBytes);
        this.#blockPayloadBytes = 0;
        this.#state = this.#lastBlock
          ? this.#hasChecksum
            ? "CHECKSUM"
            : "DONE"
          : "BLOCK_HEADER";
        if (this.#state === "DONE" && this.#buffer.length > 0) {
          throw new Error(
            "Artifact contains trailing data or multiple zstd frames.",
          );
        }
        return true;
      }
      case "CHECKSUM": {
        const field = this.#take(4);
        if (!field) return false;
        this.#state = "DONE";
        if (this.#buffer.length > 0) {
          throw new Error(
            "Artifact contains trailing data or multiple zstd frames.",
          );
        }
        return true;
      }
      case "DONE":
        if (this.#buffer.length > 0) {
          throw new Error(
            "Artifact contains trailing data or multiple zstd frames.",
          );
        }
        return false;
    }
  }

  #take(length: number): Buffer | null {
    if (this.#buffer.length < length) return null;
    const field = this.#buffer.subarray(0, length);
    this.#buffer = this.#buffer.subarray(length);
    return field;
  }
}

export async function inspectSingleZstdFrame(
  inputPath: string,
  maxCompressedBytes = 512 * 1024 * 1024,
): Promise<ZstdEnvelopeInspection> {
  if (!Number.isSafeInteger(maxCompressedBytes) || maxCompressedBytes < 1) {
    throw new Error("Compressed byte limit must be a positive safe integer.");
  }
  const scanner = new SingleFrameScanner(maxCompressedBytes);
  for await (const chunk of createReadStream(inputPath)) {
    scanner.accept(Buffer.from(chunk));
  }
  return scanner.finish();
}
