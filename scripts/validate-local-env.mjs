import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { localEnvironmentSchema } from "../packages/shared/dist/index.js";

const path = await (async () => {
  try {
    await access(".env");
    return ".env";
  } catch {
    return ".env.example";
  }
})();

const contents = await readFile(path, "utf8");
const env = Object.fromEntries(
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) {
        throw new Error(`Invalid environment entry in ${path}`);
      }
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    }),
);

const result = localEnvironmentSchema.safeParse(env);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join(".") || "environment"}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Local environment configuration is valid (${path}).`);
}
