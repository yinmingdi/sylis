export class SignedObjectStorage {
  constructor(
    private readonly maxBytes: number,
    private readonly fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async download(url: string): Promise<Buffer> {
    const response = await this.fetchImplementation(url, { redirect: "error" });
    if (!response.ok) throw new Error(`ASSET_DOWNLOAD_HTTP_${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > this.maxBytes) throw new Error("ASSET_TOO_LARGE");
    const value = Buffer.from(await response.arrayBuffer());
    if (value.byteLength > this.maxBytes) throw new Error("ASSET_TOO_LARGE");
    return value;
  }

  async upload(url: string, body: Buffer, contentType: string): Promise<void> {
    const response = await this.fetchImplementation(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: Uint8Array.from(body),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`ASSET_UPLOAD_HTTP_${response.status}`);
  }
}
