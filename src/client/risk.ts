export const RISK_LABELS: Record<number, string> = {
  1: "trivial",
  2: "low",
  3: "moderate",
  4: "high",
  5: "critical",
};

export function riskLabel(risk: number): string {
  return RISK_LABELS[risk] ?? `risk ${risk}`;
}

export const LEVELS = [1, 2, 3, 4, 5];
