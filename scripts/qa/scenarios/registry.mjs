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
  "multi-currency": Object.freeze({
    id: "multi-currency",
    version: 1,
    seed: true,
    verify: true,
    currencies: Object.freeze(["NGN", "USD"]),
  }),
  "financial-exports": Object.freeze({
    id: "financial-exports",
    version: 1,
    seed: true,
    verify: true,
    requires: Object.freeze(["multi-currency"]),
  }),
  authorization: Object.freeze({
    id: "authorization",
    version: 1,
    seed: true,
    verify: true,
    requires: Object.freeze(["approved disposable identities"]),
  }),
});

export function selectQaScenario(env = process.env) {
  const scenarioName = env.QA_SCENARIO || "baseline";
  const scenario = Object.hasOwn(QA_SCENARIOS, scenarioName)
    ? QA_SCENARIOS[scenarioName]
    : undefined;
  if (!scenario) {
    throw new Error(
      `Unsupported QA_SCENARIO=${scenarioName}; supported scenarios: ${Object.keys(QA_SCENARIOS).join(", ")}`,
    );
  }
  return scenario;
}
