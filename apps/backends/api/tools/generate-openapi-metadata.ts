import type { ReadonlyVisitor as NestReadonlyVisitor } from "@nestjs/cli/lib/compiler/interfaces/readonly-visitor.interface";
import { PluginMetadataGenerator } from "@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nodeRequire = createRequire(import.meta.url);
const { ReadonlyVisitor } = nodeRequire("@nestjs/swagger/plugin") as {
  ReadonlyVisitor: new (options: {
    introspectComments: boolean;
    pathToSource: string;
  }) => NestReadonlyVisitor;
};

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = resolve(packageRoot, "src");
const outputRoot = resolve(sourceRoot, "openapi");
const outputFile = resolve(outputRoot, "metadata.ts");

async function main(): Promise<void> {
  await new PluginMetadataGenerator().generate({
    visitors: [
      new ReadonlyVisitor({
        introspectComments: true,
        pathToSource: outputRoot,
      }),
    ],
    outputDir: outputRoot,
    filename: "metadata.ts",
    tsconfigPath: relative(
      process.cwd(),
      resolve(packageRoot, "tsconfig.openapi.json"),
    ),
    watch: false,
    printDiagnostics: false,
  });

  const metadata = await readFile(outputFile, "utf8");
  const normalizedMetadata = metadata
    .replace(/^\/\* eslint-disable \*\/\r?\n/, "")
    .replaceAll(
      "../../../../../packages/job-contracts/dist/contracts/data-export",
      "@sylis/job-contracts",
    );
  await writeFile(outputFile, normalizedMetadata, "utf8");
}

const keepAlive = setInterval(() => undefined, 1_000);
void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
