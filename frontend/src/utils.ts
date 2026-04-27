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

export function formatIsoDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ---------- CPF / CNPJ ----------

export function onlyDigits(s: string): string {
  return (s || "").replace(/\D+/g, "");
}

export function maskCPF(s: string): string {
  const d = onlyDigits(s).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskCNPJ(s: string): string {
  const d = onlyDigits(s).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCPF(s: string | null | undefined): string {
  if (!s) return "";
  const d = onlyDigits(s);
  if (d.length !== 11) return s; // mantém como está se não bater
  return maskCPF(d);
}

export function formatCNPJ(s: string | null | undefined): string {
  if (!s) return "";
  const d = onlyDigits(s);
  if (d.length !== 14) return s;
  return maskCNPJ(d);
}

export function isValidCPF(s: string): boolean {
  const d = onlyDigits(s);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCNPJ(s: string): boolean {
  const d = onlyDigits(s);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
