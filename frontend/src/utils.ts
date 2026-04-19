export const WEEKDAYS = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function currentYearMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// IRRF 1,50% + PIS 0,65% + COFINS 3% + CSLL 1% = 6,15%
export const TAX_RATES = {
  irrf: 0.015,
  pis: 0.0065,
  cofins: 0.03,
  csll: 0.01,
};
export const TOTAL_TAX_RATE =
  TAX_RATES.irrf + TAX_RATES.pis + TAX_RATES.cofins + TAX_RATES.csll;

export function computeTaxes(gross: number): { taxes: number; net: number } {
  const taxes = Math.round(gross * TOTAL_TAX_RATE * 100) / 100;
  const net = Math.round((gross - taxes) * 100) / 100;
  return { taxes, net };
}

export type TaxBreakdown = {
  irrf: number;
  pis: number;
  cofins: number;
  csll: number;
  total: number;
  net: number;
};

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeTaxBreakdown(gross: number): TaxBreakdown {
  const irrf = roundTo2(gross * TAX_RATES.irrf);
  const pis = roundTo2(gross * TAX_RATES.pis);
  const cofins = roundTo2(gross * TAX_RATES.cofins);
  const csll = roundTo2(gross * TAX_RATES.csll);
  const total = roundTo2(irrf + pis + cofins + csll);
  const net = roundTo2(gross - total);
  return { irrf, pis, cofins, csll, total, net };
}

export const TAX_LABELS: { key: keyof Omit<TaxBreakdown, "total" | "net">; label: string; rate: number }[] = [
  { key: "irrf", label: "IRRF", rate: TAX_RATES.irrf },
  { key: "pis", label: "PIS", rate: TAX_RATES.pis },
  { key: "cofins", label: "COFINS", rate: TAX_RATES.cofins },
  { key: "csll", label: "CSLL", rate: TAX_RATES.csll },
];

export function formatRatePercent(rate: number): string {
  return `${(rate * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
