/**
 * Whether a stored card score is out of date: profile role / years changed, or the native engine
 * version moved on (`engineVersion` null = service unreachable → only compare the inputs).
 */
export function isCardScoreStale(
  stored: string | null,
  inputsKey: string,
  engineVersion: string | null,
): boolean {
  if (!stored) return true;
  const at = stored.lastIndexOf("|v");
  const storedInputs = at >= 0 ? stored.slice(0, at) : stored;
  const storedVersion = at >= 0 ? stored.slice(at + 2) : null;
  if (storedInputs !== inputsKey) return true;
  return engineVersion !== null && storedVersion !== engineVersion;
}
