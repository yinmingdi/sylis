import { createReadStream } from "node:fs";

const FRAME_MAGIC = 0xfd2fb528;
const SKIPPABLE_MIN = 0x184d2a50;
const SKIPPABLE_MAX = 0x184d2a5f;
const MAX_BLOCK_SIZE = 128 * 1024;

type State =
  | "MAGIC"
  | "DESCRIPTOR"
  | "FRAME_HEADER"
  | "BLOCK_HEADER"
  | "BLOCK_PAYLOAD"
  | "CHECKSUM"
  | "DONE";

class SingleFrameScanner {
  private state: State = "MAGIC";
  private buffer: Buffer = Buffer.alloc(0);
  private frameHeaderBytes = 0;
  private blockPayloadBytes = 0;
  private lastBlock = false;
  private hasChecksum = false;
  private compressedBytes = 0;

  constructor(private readonly limit: number) {}

  accept(chunk: Buffer): void {
    this.compressedBytes += chunk.length;
    if (this.compressedBytes > this.limit)
      throw new Error("ARTIFACT_COMPRESSED_LIMIT_EXCEEDED");
    if (this.state === "DONE" && chunk.length > 0)
      throw new Error("ARTIFACT_ZSTD_TRAILING_DATA");
    this.buffer =
      this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    while (this.advance()) continue;
  }

  finish(): number {
    if (this.state !== "DONE" || this.buffer.length !== 0) {
      throw new Error("ARTIFACT_ZSTD_TRUNCATED");
    }
    return this.compressedBytes;
  }

  private advance(): boolean {
    if (this.state === "MAGIC") {
      const field = this.take(4);
      if (!field) return false;
      const magic = field.readUInt32LE(0);
      if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX) {
        throw new Error("ARTIFACT_ZSTD_SKIPPABLE_FRAME");
      }
      if (magic !== FRAME_MAGIC) throw new Error("ARTIFACT_ZSTD_MAGIC_INVALID");
      this.state = "DESCRIPTOR";
      return true;
    }
    if (this.state === "DESCRIPTOR") {
      const field = this.take(1);
      if (!field) return false;
      const descriptor = field[0]!;
      if ((descriptor & 0x18) !== 0)
        throw new Error("ARTIFACT_ZSTD_RESERVED_BITS");
      const contentSizeFlag = descriptor >>> 6;
      const singleSegment = (descriptor & 0x20) !== 0;
      const dictionaryIdBytes = [0, 1, 2, 4][descriptor & 0x03]!;
      const contentSizeBytes =
        contentSizeFlag === 0
          ? singleSegment
            ? 1
            : 0
          : [0, 2, 4, 8][contentSizeFlag]!;
      this.hasChecksum = (descriptor & 0x04) !== 0;
      this.frameHeaderBytes =
        (singleSegment ? 0 : 1) + dictionaryIdBytes + contentSizeBytes;
      this.state = "FRAME_HEADER";
      return true;
    }
    if (this.state === "FRAME_HEADER") {
      if (!this.take(this.frameHeaderBytes)) return false;
      this.state = "BLOCK_HEADER";
      return true;
    }
    if (this.state === "BLOCK_HEADER") {
      const field = this.take(3);
      if (!field) return false;
      const header = field.readUIntLE(0, 3);
      this.lastBlock = (header & 0x01) !== 0;
      const blockType = (header >>> 1) & 0x03;
      const blockSize = header >>> 3;
      if (blockType === 3 || blockSize > MAX_BLOCK_SIZE) {
        throw new Error("ARTIFACT_ZSTD_BLOCK_INVALID");
      }
      this.blockPayloadBytes = blockType === 1 ? 1 : blockSize;
      this.state = "BLOCK_PAYLOAD";
      return true;
    }
    if (this.state === "BLOCK_PAYLOAD") {
      if (this.buffer.length < this.blockPayloadBytes) {
        this.blockPayloadBytes -= this.buffer.length;
        this.buffer = Buffer.alloc(0);
        return false;
      }
      this.buffer = this.buffer.subarray(this.blockPayloadBytes);
      this.blockPayloadBytes = 0;
      this.state = this.lastBlock
        ? this.hasChecksum
          ? "CHECKSUM"
          : "DONE"
        : "BLOCK_HEADER";
      if (this.state === "DONE" && this.buffer.length > 0) {
        throw new Error("ARTIFACT_ZSTD_TRAILING_DATA");
      }
      return true;
    }
    if (this.state === "CHECKSUM") {
      if (!this.take(4)) return false;
      this.state = "DONE";
      if (this.buffer.length > 0)
        throw new Error("ARTIFACT_ZSTD_TRAILING_DATA");
      return true;
    }
    if (this.buffer.length > 0) throw new Error("ARTIFACT_ZSTD_TRAILING_DATA");
    return false;
  }

  private take(length: number): Buffer | null {
    if (this.buffer.length < length) return null;
    const field = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return field;
  }
}

export async function inspectSingleZstdFrame(
  inputPath: string,
  maxCompressedBytes = 512 * 1024 * 1024,
): Promise<number> {
  const scanner = new SingleFrameScanner(maxCompressedBytes);
  for await (const chunk of createReadStream(inputPath))
    scanner.accept(Buffer.from(chunk));
  return scanner.finish();
}
