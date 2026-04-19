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
