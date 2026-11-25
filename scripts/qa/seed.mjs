import { seedQaRun } from "./workflow.mjs";

try {
  const result = await seedQaRun(process.env, {
    resume: process.argv.includes("--resume"),
  });
  process.stdout.write(
    `QA run ${result.manifest.runId} reached stage ${result.manifest.stage}. Manifest: ${result.path}\n`,
  );
} catch (error) {
  process.stderr.write(`QA seed stopped safely: ${error.message}\n`);
  process.exitCode = 1;
}
