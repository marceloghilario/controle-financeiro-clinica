import { useEffect, useState } from "react";
import {
  api,
  type HealthPlan,
  type HealthPlanMonthReport,
  type Patient,
  type PatientMonthReport,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { MONTHS, currentYearMonth, formatBRL } from "../utils";

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

function PatientReportCard({ report }: { report: PatientMonthReport }) {
  return (
    <Card
      title={`${report.patient_name} · ${MONTHS[report.month - 1]}/${report.year}`}
      subtitle={`Plano de saúde: ${report.health_plan_name}`}
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
    </Card>
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
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
