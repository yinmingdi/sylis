import { deflateSync } from "node:zlib";

import { AssetMimeType } from "@sylis/agent-contracts";

export enum E2eAssetFixtureKind {
  IMAGE = "IMAGE",
  PDF = "PDF",
  TEXT = "TEXT",
}

export interface E2eAssetFixture {
  name: string;
  mimeType: AssetMimeType;
  buffer: Buffer;
}

export function e2eAssetFixture(kind: E2eAssetFixtureKind): E2eAssetFixture {
  switch (kind) {
    case E2eAssetFixtureKind.TEXT:
      return {
        name: "bank-context.txt",
        mimeType: AssetMimeType.TEXT_PLAIN,
        buffer: Buffer.from(
          "Bank is a financial institution. A river bank is land beside water.\n",
        ),
      };
    case E2eAssetFixtureKind.PDF:
      return {
        name: "bank-reading.pdf",
        mimeType: AssetMimeType.PDF,
        buffer: pdfFixture("Bank study context for a deterministic PDF."),
      };
    case E2eAssetFixtureKind.IMAGE:
      return {
        name: "bank-note.png",
        mimeType: AssetMimeType.PNG,
        buffer: pngTextFixture("BANK"),
      };
  }
}

function pdfFixture(text: string): Buffer {
  const stream = `BT /F1 24 Tf 72 720 Td (${pdfText(text)}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  document += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, "ascii");
}

function pdfText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

const glyphs: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
};

function pngTextFixture(value: string): Buffer {
  const scale = 8;
  const padding = 20;
  const glyphWidth = 5 * scale;
  const gap = scale;
  const width =
    padding * 2 + value.length * glyphWidth + (value.length - 1) * gap;
  const height = padding * 2 + 7 * scale;
  const pixels = Buffer.alloc(width * height, 0xff);
  for (const [characterIndex, character] of [...value].entries()) {
    const glyph = glyphs[character];
    if (!glyph) throw new Error(`E2E_PNG_GLYPH_UNSUPPORTED:${character}`);
    for (const [rowIndex, row] of glyph.entries()) {
      for (const [columnIndex, bit] of [...row].entries()) {
        if (bit !== "1") continue;
        for (let y = 0; y < scale; y += 1) {
          for (let x = 0; x < scale; x += 1) {
            const pixelX =
              padding +
              characterIndex * (glyphWidth + gap) +
              columnIndex * scale +
              x;
            const pixelY = padding + rowIndex * scale + y;
            pixels[pixelY * width + pixelX] = 0;
          }
        }
      }
    }
  }
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const target = row * (width + 1);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, row * width, (row + 1) * width);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
