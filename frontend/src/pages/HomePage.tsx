import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_ORDER,
  type HealthPlan,
  type Invoice,
  type InvoiceStatus,
  type Patient,
  type Specialty,
} from "../api";
import { Button, Card } from "../components/Card";
import {
  MONTHS,
  currentYearMonth,
  formatBRL,
  formatIsoDate,
} from "../utils";

function statusBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case "paga":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "emitida":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "enviada":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "cancelada":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
}

const SHORTCUTS: { to: string; label: string; description: string }[] = [
  {
    to: "/pacientes",
    label: "Pacientes",
    description: "Cadastro de pacientes, CPF e código do beneficiário",
  },
  {
    to: "/plano-semanal",
    label: "Plano semanal",
    description: "Define por dia quais terapias cada paciente realiza",
  },
  {
    to: "/faltas",
    label: "Faltas",
    description: "Marque os dias em que o paciente faltou no mês",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    description: "Calcule sessões e valores por paciente ou plano",
  },
  {
    to: "/notas-fiscais",
    label: "Notas fiscais",
    description: "Gerencie emissão, status e impressão das notas",
  },
];

export default function HomePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [p, hp, sp, inv] = await Promise.all([
          api.get<Patient[]>("/api/patients"),
          api.get<HealthPlan[]>("/api/health-plans"),
          api.get<Specialty[]>("/api/specialties"),
          api.get<Invoice[]>("/api/invoices"),
        ]);
        if (!mounted) return;
        setPatients(p);
        setPlans(hp);
        setSpecialties(sp);
        setInvoices(inv);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activePatients = useMemo(
    () => patients.filter((p) => p.active !== 0),
    [patients],
  );

  const patientsByPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const pl of plans) map.set(pl.name, 0);
    for (const p of activePatients) {
      const name = p.health_plan_name || "Sem plano";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .filter(([, n]) => n > 0 || plans.some((pl) => pl.name === ""))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }, [activePatients, plans]);

  const statusCounts = useMemo(() => {
    const counts: Record<InvoiceStatus, number> = {
      em_aberto: 0,
      emitida: 0,
      enviada: 0,
      paga: 0,
      cancelada: 0,
    };
    for (const inv of invoices) counts[inv.status] += 1;
    return counts;
  }, [invoices]);

  const { year, month } = currentYearMonth();
  const monthInvoices = useMemo(
    () =>
      invoices.filter(
        (i) => i.reference_year === year && i.reference_month === month,
      ),
    [invoices, year, month],
  );
  const monthTotals = useMemo(() => {
    let gross = 0;
    let taxes = 0;
    let net = 0;
    for (const i of monthInvoices) {
      if (i.status === "cancelada") continue;
      gross += i.gross_value;
      taxes += i.taxes;
      net += i.net_value;
    }
    return { gross, taxes, net };
  }, [monthInvoices]);

  const openAmount = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "em_aberto")
        .reduce((s, i) => s + i.gross_value, 0),
    [invoices],
  );
  const paidAmount = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "paga")
        .reduce((s, i) => s + i.net_value, 0),
    [invoices],
  );

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => {
          const ad = a.issue_date.localeCompare(b.issue_date);
          if (ad !== 0) return -ad;
          return b.id - a.id;
        })
        .slice(0, 5),
    [invoices],
  );

  const maxPlanCount = patientsByPlan.reduce(
    (m, [, n]) => Math.max(m, n),
    0,
  );
  const maxStatusCount = INVOICE_STATUS_ORDER.reduce(
    (m, s) => Math.max(m, statusCounts[s]),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Bem-vindo ao Controle Financeiro da Clínica
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Organize o plano semanal dos pacientes, registre faltas por data,
              calcule valores por plano de saúde e acompanhe suas notas fiscais
              em um único lugar.
            </p>
          </div>
          <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            Competência atual:{" "}
            <span className="font-medium text-slate-900">
              {MONTHS[month - 1]}/{year}
            </span>
          </div>
        </div>
      </Card>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Pacientes ativos"
          value={loading ? "…" : String(activePatients.length)}
          hint={
            patients.length > activePatients.length
              ? `${patients.length - activePatients.length} inativos`
              : undefined
          }
          to="/pacientes"
        />
        <StatCard
          label="Planos de saúde"
          value={loading ? "…" : String(plans.length)}
          to="/planos-de-saude"
        />
        <StatCard
          label="Especialidades"
          value={loading ? "…" : String(specialties.length)}
          to="/especialidades"
        />
        <StatCard
          label="Notas fiscais"
          value={loading ? "…" : String(invoices.length)}
          hint={
            invoices.length > 0
              ? `${statusCounts.em_aberto} em aberto`
              : undefined
          }
          to="/notas-fiscais"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title={`Faturamento de ${MONTHS[month - 1]}/${year}`}
          subtitle="Notas com competência no mês atual (canceladas excluídas)"
        >
          {loading ? (
            <div className="text-sm text-slate-500">Carregando…</div>
          ) : monthInvoices.length === 0 ? (
            <div className="text-sm text-slate-500">
              Nenhuma nota emitida para o mês atual ainda.{" "}
              <Link
                to="/relatorios"
                className="text-slate-900 underline underline-offset-2"
              >
                Gerar relatório
              </Link>
              .
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <MoneyBlock label="Bruto" value={monthTotals.gross} />
              <MoneyBlock label="Impostos" value={monthTotals.taxes} />
              <MoneyBlock label="Líquido" value={monthTotals.net} strong />
              <div className="col-span-3 text-xs text-slate-500">
                {monthInvoices.length} nota(s) no mês.
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <MoneyBlock label="Em aberto (bruto)" value={openAmount} />
            <MoneyBlock label="Pagas (líquido)" value={paidAmount} />
          </div>
        </Card>

        <Card
          title="Notas por status"
          subtitle="Distribuição atual das notas cadastradas"
        >
          {loading ? (
            <div className="text-sm text-slate-500">Carregando…</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-slate-500">
              Nenhuma nota cadastrada.{" "}
              <Link
                to="/notas-fiscais"
                className="text-slate-900 underline underline-offset-2"
              >
                Cadastrar nota
              </Link>
              .
            </div>
          ) : (
            <ul className="space-y-2">
              {INVOICE_STATUS_ORDER.map((s) => {
                const count = statusCounts[s];
                const pct =
                  maxStatusCount > 0 ? (count / maxStatusCount) * 100 : 0;
                return (
                  <li key={s}>
                    <div className="flex items-center justify-between gap-2 text-sm mb-1">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                          s,
                        )}`}
                      >
                        {INVOICE_STATUS_LABELS[s]}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-slate-900"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Pacientes por plano de saúde"
          subtitle="Considera apenas pacientes ativos"
        >
          {loading ? (
            <div className="text-sm text-slate-500">Carregando…</div>
          ) : patientsByPlan.length === 0 ? (
            <div className="text-sm text-slate-500">
              Nenhum paciente cadastrado ainda.{" "}
              <Link
                to="/pacientes"
                className="text-slate-900 underline underline-offset-2"
              >
                Cadastrar paciente
              </Link>
              .
            </div>
          ) : (
            <ul className="space-y-2">
              {patientsByPlan.map(([name, count]) => {
                const pct =
                  maxPlanCount > 0 ? (count / maxPlanCount) * 100 : 0;
                return (
                  <li key={name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-slate-700">{name}</span>
                      <span className="font-medium text-slate-900">
                        {count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Últimas notas fiscais" subtitle="5 notas mais recentes">
          {loading ? (
            <div className="text-sm text-slate-500">Carregando…</div>
          ) : recentInvoices.length === 0 ? (
            <div className="text-sm text-slate-500">
              Nenhuma nota cadastrada ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-2 py-1">Nº</th>
                    <th className="text-left px-2 py-1">Emissão</th>
                    <th className="text-left px-2 py-1">Paciente</th>
                    <th className="text-right px-2 py-1">Líquido</th>
                    <th className="text-left px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-2 py-1">{inv.number || "—"}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {formatIsoDate(inv.issue_date)}
                      </td>
                      <td className="px-2 py-1">{inv.patient_name}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {formatBRL(inv.net_value)}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                            inv.status,
                          )}`}
                        >
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <Link to="/notas-fiscais">
              <Button variant="secondary">Ver todas as notas</Button>
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Atalhos" subtitle="Fluxo típico da clínica">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="block border border-slate-200 rounded-md p-3 hover:border-slate-400 hover:bg-slate-50 transition"
            >
              <div className="font-medium text-slate-900">{s.label}</div>
              <div className="text-xs text-slate-500 mt-1">{s.description}</div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) {
  const inner = (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-slate-400 transition h-full">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function MoneyBlock({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={
          strong ? "text-lg font-semibold text-slate-900" : "font-medium"
        }
      >
        {formatBRL(value)}
      </div>
    </div>
  );
}
