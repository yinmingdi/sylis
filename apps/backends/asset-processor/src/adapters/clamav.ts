import { connect } from "node:net";

export class ClamAvClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  scan(value: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const responses: Buffer[] = [];
      socket.setTimeout(30_000);
      socket.once("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < value.length; offset += 64 * 1024) {
          const chunk = value.subarray(offset, offset + 64 * 1024);
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => responses.push(chunk));
      socket.once("timeout", () => socket.destroy(new Error("CLAMAV_TIMEOUT")));
      socket.once("error", reject);
      socket.once("close", (hadError) => {
        if (hadError) return;
        const response = Buffer.concat(responses).toString("utf8");
        if (response.includes("FOUND")) reject(new Error("MALWARE_DETECTED"));
        else if (!response.includes("OK"))
          reject(new Error("CLAMAV_INVALID_RESPONSE"));
        else resolve();
      });
    });
  }
}
