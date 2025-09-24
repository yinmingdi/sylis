import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ApiGenerator } from "./api-generator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const rootPath = resolve(__dirname, "../../../");
  const outputPath = resolve(__dirname, "../apis");

  const api = new ApiGenerator({ rootPath, outputPath });

  api.cleanOutput();

  await api.generateDocs();
}

main();
