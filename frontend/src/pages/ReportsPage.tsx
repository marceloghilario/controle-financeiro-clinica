import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type HealthPlan,
  type HealthPlanMonthReport,
  type Invoice,
  type Patient,
  type PatientMonthReport,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import {
  MONTHS,
  TAX_LABELS,
  WEEKDAYS,
  computeTaxBreakdown,
  currentYearMonth,
  formatBRL,
  formatCPF,
  formatRatePercent,
} from "../utils";

export function buildInvoiceText(report: PatientMonthReport): string {
  const billedItems = report.items.filter((i) => i.sessions_billed > 0);
  const lines: string[] = [];
  lines.push(
    `Sessão realizada pelo menor ${report.patient_name}` +
      (report.patient_cpf ? ` - CPF: ${formatCPF(report.patient_cpf)}` : ""),
  );
  lines.push(`Beneficiário: ${report.patient_beneficiary || "—"}`);
  for (const i of billedItems) {
    const sessoesLabel = i.sessions_billed === 1 ? "sessão" : "sessões";
    lines.push(
      `${i.specialty_name} ${i.sessions_billed} ${sessoesLabel} — Valor individual ${formatBRL(
        i.unit_value,
      )} - Valor total ${formatBRL(i.total)}`,
    );
  }
  lines.push(
    `referente ao mês de ${MONTHS[report.month - 1]} de ${report.year}`,
  );
  lines.push("");
  lines.push(`Valor total: ${formatBRL(report.total)}`);
  return lines.join("\n");
}

type Mode = "patient" | "plan";

export default function ReportsPage() {
  const [mode, setMode] = useState<Mode>("plan");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");
  const [planId, setPlanId] = useState<number | "">("");

  const now = currentYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  const [patientReport, setPatientReport] = useState<PatientMonthReport | null>(null);
  const [planReport, setPlanReport] = useState<HealthPlanMonthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Patient[]>("/api/patients"),
      api.get<HealthPlan[]>("/api/health-plans"),
    ])
      .then(([p, pl]) => {
        setPatients(p);
        setPlans(pl);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    setPatientReport(null);
    setPlanReport(null);
    try {
      if (mode === "patient") {
        if (patientId === "") throw new Error("Selecione um paciente.");
        const r = await api.get<PatientMonthReport>(
          `/api/reports/patient/${patientId}?year=${year}&month=${month}`,
        );
        setPatientReport(r);
      } else {
        if (planId === "") throw new Error("Selecione um plano de saúde.");
        const r = await api.get<HealthPlanMonthReport>(
          `/api/reports/health-plan/${planId}?year=${year}&month=${month}`,
        );
        setPlanReport(r);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Relatório financeiro mensal"
        subtitle="Consolida os valores a faturar por paciente e por plano de saúde para geração de notas fiscais."
      >
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === "plan" ? "primary" : "secondary"}
            onClick={() => setMode("plan")}
          >
            Por plano de saúde
          </Button>
          <Button
            variant={mode === "patient" ? "primary" : "secondary"}
            onClick={() => setMode("patient")}
          >
            Por paciente
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          {mode === "patient" ? (
            <div className="flex flex-col gap-1 md:col-span-3">
              <Label>Paciente</Label>
              <Select
                value={patientId}
                onChange={(e) =>
                  setPatientId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">Selecione…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.health_plan_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1 md:col-span-3">
              <Label>Plano de saúde</Label>
              <Select
                value={planId}
                onChange={(e) =>
                  setPlanId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">Selecione…</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>Mês</Label>
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Ano</Label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
        <Button onClick={generate} disabled={loading}>
          {loading ? "Gerando…" : "Gerar relatório"}
        </Button>
        {error && <div className="text-sm text-red-600 mt-3">{error}</div>}
      </Card>

      {patientReport && <PatientReportCard report={patientReport} />}
      {planReport && <PlanReportCard report={planReport} />}
    </div>
  );
}

function TaxBreakdownBlock({ gross }: { gross: number }) {
  const bd = computeTaxBreakdown(gross);
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm max-w-md">
      <div className="font-medium text-slate-700 mb-2">
        Impostos sobre o valor bruto
      </div>
      <table className="w-full">
        <tbody>
          <tr>
            <td className="text-slate-600 py-0.5">Valor bruto</td>
            <td className="text-right py-0.5 font-medium">{formatBRL(gross)}</td>
          </tr>
          {TAX_LABELS.map((t) => (
            <tr key={t.key}>
              <td className="text-slate-600 py-0.5">
                {t.label} ({formatRatePercent(t.rate)})
              </td>
              <td className="text-right py-0.5">{formatBRL(bd[t.key])}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200">
            <td className="text-slate-700 py-1">Total de impostos (6,15%)</td>
            <td className="text-right py-1">{formatBRL(bd.total)}</td>
          </tr>
          <tr>
            <td className="font-semibold py-0.5">Valor líquido</td>
            <td className="text-right font-semibold py-0.5">
              {formatBRL(bd.net)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function GenerateInvoiceModal({
  report,
  open,
  onClose,
  onCreated,
}: {
  report: PatientMonthReport;
  open: boolean;
  onClose: () => void;
  onCreated: (inv: Invoice) => void;
}) {
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNumber("");
      setIssueDate(todayIso());
      setError(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const bd = computeTaxBreakdown(report.total);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        number: number.trim() || null,
        issue_date: issueDate,
        patient_id: report.patient_id,
        patient_name: report.patient_name,
        reference_year: report.year,
        reference_month: report.month,
        health_plan_name: report.health_plan_name,
        gross_value: report.total,
        net_value: bd.net,
        taxes: bd.total,
        notes: buildInvoiceText(report),
        status: "em_aberto" as const,
      };
      const created = await api.post<Invoice>("/api/invoices", payload);
      onCreated(created);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Gerar nota fiscal</h3>
          <p className="text-xs text-slate-500">
            {report.patient_name} · {MONTHS[report.month - 1]}/{report.year} ·{" "}
            {report.health_plan_name}
          </p>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="flex flex-col gap-1">
            <Label>Número da nota</Label>
            <Input
              autoFocus
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Data de emissão</Label>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              required
            />
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-0.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Valor bruto</span>
              <span className="font-medium">{formatBRL(report.total)}</span>
            </div>
            {TAX_LABELS.map((t) => (
              <div key={t.key} className="flex justify-between">
                <span className="text-slate-600">
                  {t.label} ({formatRatePercent(t.rate)})
                </span>
                <span>{formatBRL(bd[t.key])}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
              <span className="text-slate-700">Total de impostos (6,15%)</span>
              <span>{formatBRL(bd.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Valor líquido</span>
              <span className="font-semibold">{formatBRL(bd.net)}</span>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || report.total <= 0}>
              {saving ? "Gerando…" : "Gerar nota"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PatientReportCard({ report }: { report: PatientMonthReport }) {
  const invoiceText = useMemo(() => buildInvoiceText(report), [report]);
  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoiceText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível — ignora; o usuário pode selecionar o texto
    }
  }

  function onCreated(inv: Invoice) {
    setModalOpen(false);
    setGenMessage(
      `Nota #${inv.id}${inv.number ? ` (${inv.number})` : ""} criada. Redirecionando…`,
    );
    setTimeout(() => navigate("/notas-fiscais"), 800);
  }

  return (
    <Card
      title={`${report.patient_name} · ${MONTHS[report.month - 1]}/${report.year}`}
      subtitle={`Plano de saúde: ${report.health_plan_name}${
        report.patient_cpf ? ` · CPF ${formatCPF(report.patient_cpf)}` : ""
      }${
        report.patient_beneficiary
          ? ` · Cód. beneficiário: ${report.patient_beneficiary}`
          : ""
      }`}
    >
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-3 py-2">Especialidade</th>
            <th className="text-right px-3 py-2">Sessões previstas</th>
            <th className="text-right px-3 py-2">Faltas</th>
            <th className="text-right px-3 py-2">Sessões faturáveis</th>
            <th className="text-right px-3 py-2">Valor unitário</th>
            <th className="text-right px-3 py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {report.items.map((i) => (
            <tr key={i.specialty_id}>
              <td className="px-3 py-2">{i.specialty_name}</td>
              <td className="px-3 py-2 text-right">{i.sessions_planned}</td>
              <td className="px-3 py-2 text-right">{i.absences}</td>
              <td className="px-3 py-2 text-right">{i.sessions_billed}</td>
              <td className="px-3 py-2 text-right">{formatBRL(i.unit_value)}</td>
              <td className="px-3 py-2 text-right">{formatBRL(i.total)}</td>
            </tr>
          ))}
          {report.items.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-4 text-slate-500">
                Nenhuma sessão prevista no mês.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td colSpan={5} className="px-3 py-2 text-right font-semibold">
              Total do paciente:
            </td>
            <td className="px-3 py-2 text-right font-semibold">
              {formatBRL(report.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <TaxBreakdownBlock gross={report.total} />

      {report.absence_days.length > 0 && (
        <div className="mt-4 text-sm">
          <div className="font-medium text-slate-700 mb-1">Dias de falta:</div>
          <ul className="space-y-1">
            {report.absence_days.map((a) => {
              const [y, m, d] = a.date.split("-");
              return (
                <li key={a.date} className="text-slate-600">
                  <span className="font-mono">
                    {d}/{m}/{y}
                  </span>{" "}
                  ({WEEKDAYS[a.day_of_week]}) —{" "}
                  {a.impacted_specialties.length > 0
                    ? a.impacted_specialties.join(", ")
                    : "sem terapias previstas"}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="font-medium text-slate-700">
            Texto para nota fiscal
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? "Copiado!" : "Copiar texto"}
            </Button>
            <Button
              onClick={() => setModalOpen(true)}
              disabled={report.total <= 0}
            >
              Gerar nota
            </Button>
          </div>
        </div>
        {genMessage && (
          <div className="text-sm text-slate-600 mb-2">{genMessage}</div>
        )}
        <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-200 rounded-md p-3 font-sans">
{invoiceText}
        </pre>
      </div>
      <GenerateInvoiceModal
        report={report}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={onCreated}
      />
    </Card>
  );
}

function PlanPatientInvoiceButton({ report }: { report: PatientMonthReport }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function onCreated(inv: Invoice) {
    setOpen(false);
    setMessage(
      `Nota #${inv.id}${inv.number ? ` (${inv.number})` : ""} criada · líquido ${formatBRL(
        inv.net_value,
      )}`,
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={() => setOpen(true)} disabled={report.total <= 0}>
        Gerar nota
      </Button>
      {message && <span className="text-xs text-slate-600">{message}</span>}
      <GenerateInvoiceModal
        report={report}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={onCreated}
      />
    </div>
  );
}

function PlanReportCard({ report }: { report: HealthPlanMonthReport }) {
  return (
    <Card
      title={`${report.health_plan_name} · ${MONTHS[report.month - 1]}/${report.year}`}
      subtitle="Valores a faturar por paciente deste plano de saúde"
      actions={
        <div className="text-right">
          <div className="text-xs text-slate-500">Total do plano</div>
          <div className="text-lg font-semibold">{formatBRL(report.total)}</div>
        </div>
      }
    >
      {report.patients.length === 0 ? (
        <div className="text-sm text-slate-500">
          Nenhum paciente com sessões neste plano no mês.
        </div>
      ) : (
        <div className="space-y-3">
          {report.patients.map((p) => (
            <details key={p.patient_id} className="border border-slate-200 rounded-md">
              <summary className="cursor-pointer flex items-center justify-between px-3 py-2 bg-slate-50">
                <span className="font-medium">{p.patient_name}</span>
                <span className="font-semibold">{formatBRL(p.total)}</span>
              </summary>
              <div className="p-3">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left px-2 py-1">Especialidade</th>
                      <th className="text-right px-2 py-1">Prev.</th>
                      <th className="text-right px-2 py-1">Faltas</th>
                      <th className="text-right px-2 py-1">Faturáveis</th>
                      <th className="text-right px-2 py-1">Unit.</th>
                      <th className="text-right px-2 py-1">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {p.items.map((i) => (
                      <tr key={i.specialty_id}>
                        <td className="px-2 py-1">{i.specialty_name}</td>
                        <td className="px-2 py-1 text-right">{i.sessions_planned}</td>
                        <td className="px-2 py-1 text-right">{i.absences}</td>
                        <td className="px-2 py-1 text-right">{i.sessions_billed}</td>
                        <td className="px-2 py-1 text-right">{formatBRL(i.unit_value)}</td>
                        <td className="px-2 py-1 text-right">{formatBRL(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <TaxBreakdownBlock gross={p.total} />
                <div className="mt-3 flex justify-end">
                  <PlanPatientInvoiceButton report={p} />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
