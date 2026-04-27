const DEFAULT_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "";

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") || DEFAULT_BASE;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};

export type HealthPlan = {
  id: number;
  name: string;
  cnpj?: string | null;
  notes?: string | null;
};
export type Specialty = { id: number; name: string; display_order?: number };
export type SpecialtyPrice = {
  id: number;
  specialty_id: number;
  health_plan_id: number;
  value: number;
  therapy_code: string | null;
  specialty_name: string;
  health_plan_name: string;
};
export type Patient = {
  id: number;
  name: string;
  cpf?: string | null;
  beneficiary?: string | null;
  health_plan_id: number;
  health_plan_name?: string | null;
  active: number;
};
export type WeeklyPlanEntry = {
  id: number;
  patient_id: number;
  day_of_week: number;
  specialty_id: number;
  specialty_name?: string | null;
  sessions: number;
};
export type Holiday = {
  id: number;
  date: string; // YYYY-MM-DD
  description: string | null;
};
export type AbsenceDay = {
  id: number;
  patient_id: number;
  date: string; // YYYY-MM-DD
  note: string | null;
  day_of_week: number;
  impacted_specialties: string[];
};
export type SpecialtyReportItem = {
  specialty_id: number;
  specialty_name: string;
  sessions_planned: number;
  absences: number;
  sessions_billed: number;
  unit_value: number;
  total: number;
};
export type AbsenceDetail = {
  date: string;
  day_of_week: number;
  impacted_specialties: string[];
};
export type PatientMonthReport = {
  patient_id: number;
  patient_name: string;
  patient_cpf?: string | null;
  patient_beneficiary?: string | null;
  health_plan_id: number;
  health_plan_name: string;
  year: number;
  month: number;
  business_days_by_weekday: Record<string, number>;
  items: SpecialtyReportItem[];
  absence_days: AbsenceDetail[];
  total: number;
};
export type HealthPlanMonthReport = {
  health_plan_id: number;
  health_plan_name: string;
  year: number;
  month: number;
  patients: PatientMonthReport[];
  total: number;
};

export type InvoiceStatus =
  | "em_aberto"
  | "emitida"
  | "enviada"
  | "paga"
  | "paga_parcial"
  | "paga_excedente"
  | "cancelada";

export type Invoice = {
  id: number;
  number: string | null;
  issue_date: string; // YYYY-MM-DD
  patient_id: number | null;
  patient_name: string;
  reference_year: number;
  reference_month: number;
  health_plan_name: string | null;
  gross_value: number;
  net_value: number;
  taxes: number;
  notes: string | null;
  status: InvoiceStatus;
  created_at: string;
};

export type InvoiceInput = Omit<Invoice, "id" | "created_at">;

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  em_aberto: "Em aberto",
  emitida: "Emitida",
  enviada: "Enviada",
  paga: "Paga",
  paga_parcial: "Paga parcialmente",
  paga_excedente: "Paga a mais",
  cancelada: "Cancelada",
};

export const INVOICE_STATUS_ORDER: InvoiceStatus[] = [
  "em_aberto",
  "emitida",
  "enviada",
  "paga",
  "paga_parcial",
  "paga_excedente",
  "cancelada",
];

export type PayerType = "health_plan" | "patient" | "other";

export type ReceiptInvoiceSummary = {
  id: number;
  number: string | null;
  issue_date: string;
  patient_name: string;
  health_plan_name: string | null;
  reference_year: number;
  reference_month: number;
  gross_value: number;
  net_value: number;
  status: InvoiceStatus;
};

export type Receipt = {
  id: number;
  payment_date: string; // YYYY-MM-DD
  value: number;
  payer_type: PayerType;
  payer_health_plan_id: number | null;
  payer_patient_id: number | null;
  payer_name: string;
  linked_status: InvoiceStatus | null;
  notes: string | null;
  created_at: string;
  invoices: ReceiptInvoiceSummary[];
};

export type ReceiptInput = {
  payment_date: string;
  value: number;
  payer_type: PayerType;
  payer_health_plan_id: number | null;
  payer_patient_id: number | null;
  payer_name: string;
  linked_status: InvoiceStatus | null;
  notes: string | null;
  invoice_ids: number[];
};

export type InvoiceSubsetSuggestion = {
  invoice_ids: number[];
  sum_gross: number;
  sum_net: number;
  diff_gross: number;
  diff_net: number;
};

export type InvoiceSuggestionsResponse = {
  candidates: ReceiptInvoiceSummary[];
  suggestions: InvoiceSubsetSuggestion[];
};
