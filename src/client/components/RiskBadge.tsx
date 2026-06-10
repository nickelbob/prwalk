import { riskLabel } from "../risk.js";

export function RiskBadge({ risk, compact = false }: { risk: number; compact?: boolean }) {
  return (
    <span className={`risk risk-${risk}`} title={`Risk ${risk}: ${riskLabel(risk)}`}>
      {compact ? risk : `${risk} · ${riskLabel(risk)}`}
    </span>
  );
}
