import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { RetryableJobError } from "@sylis/job-contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

function s3Client(env: NodeJS.ProcessEnv): S3Client {
  return new S3Client({
    endpoint: env.AWS_ENDPOINT_URL,
    region: env.AWS_DEFAULT_REGION,
    forcePathStyle: env.AWS_S3_URL_STYLE === "path",
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

export async function materializeArtifact(
  uri: string,
  workRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  await mkdir(workRoot, { recursive: true });
  const parsed = new URL(uri);
  const output = resolve(
    workRoot,
    basename(parsed.pathname) || "artifact.json.zst",
  );
  if (parsed.protocol === "file:") {
    await writeFile(output, await readFile(parsed), { mode: 0o600 });
    return output;
  }
  if (parsed.protocol === "https:") {
    let response: Response;
    try {
      response = await fetch(uri, { signal: AbortSignal.timeout(120_000) });
    } catch (error) {
      throw new RetryableJobError("ARTIFACT_DOWNLOAD_FAILED", { cause: error });
    }
    if (!response.ok) {
      const message = `ARTIFACT_DOWNLOAD_HTTP_${response.status}`;
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(message);
      }
      throw new Error(message);
    }
    await writeFile(output, Buffer.from(await response.arrayBuffer()), {
      mode: 0o600,
    });
    return output;
  }
  if (parsed.protocol === "s3:") {
    const response = await s3Client(env).send(
      new GetObjectCommand({
        Bucket: parsed.hostname,
        Key: parsed.pathname.replace(/^\//, ""),
      }),
    );
    if (!response.Body) throw new Error("ARTIFACT_S3_BODY_MISSING");
    await writeFile(
      output,
      Buffer.from(await response.Body.transformToByteArray()),
      {
        mode: 0o600,
      },
    );
    return output;
  }
  throw new Error(`ARTIFACT_URI_PROTOCOL_UNSUPPORTED:${parsed.protocol}`);
}
