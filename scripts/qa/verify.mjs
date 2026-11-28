import { verifyQaRun } from "./workflow.mjs";

try {
  const report = await verifyQaRun();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`QA verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
