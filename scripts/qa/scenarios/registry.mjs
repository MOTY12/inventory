export const QA_SCENARIOS = Object.freeze({
  baseline: Object.freeze({
    id: "baseline",
    version: 1,
    seed: true,
    verify: true,
  }),
  "document-states": Object.freeze({
    id: "document-states",
    version: 1,
    seed: true,
    verify: true,
    coverage: Object.freeze({
      purchaseOrders: [
        "DRAFT",
        "SUBMITTED",
        "PARTIALLY_RECEIVED",
        "RECEIVED",
        "CANCELLED",
      ],
      salesOrders: [
        "DRAFT",
        "CONFIRMED",
        "PARTIALLY_FULFILLED",
        "FULFILLED",
        "CANCELLED",
      ],
    }),
  }),
});

export function selectQaScenario(env = process.env) {
  const scenarioName = env.QA_SCENARIO || "baseline";
  const scenario = QA_SCENARIOS[scenarioName];
  if (!scenario) {
    throw new Error(
      `Unsupported QA_SCENARIO=${scenarioName}; supported scenarios: ${Object.keys(QA_SCENARIOS).join(", ")}`,
    );
  }
  return scenario;
}
