export type CommandKey = { fingerprint: string; key: string };

export function commandKeyFor<T>(
  current: CommandKey | null,
  payload: T,
  createKey: () => string,
): CommandKey {
  const fingerprint = JSON.stringify(payload);
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, key: createKey() };
}
