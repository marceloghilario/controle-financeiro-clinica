import { useEffect, useMemo, useState } from "react";
import {
  api,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_ORDER,
  type HealthPlan,
  type Invoice,
  type InvoiceStatus,
  type Patient,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { MONTHS, computeTaxes, formatBRL } from "../utils";

type FormState = {
  number: string;
  issue_date: string; // YYYY-MM-DD
  patient_id: number | "";
  patient_name: string;
  reference_year: number;
  reference_month: number;
  health_plan_name: string;
  gross_value: string;
  net_value: string;
  taxes: string;
  notes: string;
  status: InvoiceStatus;
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function emptyForm(): FormState {
  const d = new Date();
  return {
    number: "",
    issue_date: todayIso(),
    patient_id: "",
    patient_name: "",
    reference_year: d.getFullYear(),
    reference_month: d.getMonth() + 1,
    health_plan_name: "",
    gross_value: "",
    net_value: "",
    taxes: "",
    notes: "",
    status: "em_aberto",
  };
}

function parseBRLNumber(v: string): number {
  if (!v) return 0;
  const normalized = v.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatDecimal(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
    case "em_aberto":
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
}

function formatIsoDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function InvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPatient, setFilterPatient] = useState<string>("");
  const [filterPlan, setFilterPlan] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | "">("");
  const [filterMonth, setFilterMonth] = useState<number | "">("");
  const [filterYear, setFilterYear] = useState<number | "">("");
  const [autoTaxes, setAutoTaxes] = useState<boolean>(true);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [printing, setPrinting] = useState<boolean>(false);

  async function load() {
    const [inv, pats, pls] = await Promise.all([
      api.get<Invoice[]>("/api/invoices"),
      api.get<Patient[]>("/api/patients"),
      api.get<HealthPlan[]>("/api/health-plans"),
    ]);
    setItems(inv);
    setPatients(pats);
    setPlans(pls);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current - 2; y <= current + 2; y++) list.push(y);
    return list;
  }, []);

  const distinctPlanNames = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.health_plan_name) set.add(it.health_plan_name);
    for (const p of plans) set.add(p.name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, plans]);

  const filtered = useMemo(() => {
    const list = items.filter((inv) => {
      if (filterStatus && inv.status !== filterStatus) return false;
      if (filterPlan && (inv.health_plan_name ?? "") !== filterPlan) return false;
      if (filterMonth !== "" && inv.reference_month !== filterMonth) return false;
      if (filterYear !== "" && inv.reference_year !== filterYear) return false;
      if (filterPatient) {
        const q = filterPatient.toLowerCase();
        if (!inv.patient_name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      const an = (a.number ?? "").trim();
      const bn = (b.number ?? "").trim();
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      const ai = Number(an);
      const bi = Number(bn);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return an.localeCompare(bn, "pt-BR", { numeric: true });
    });
  }, [items, filterPatient, filterPlan, filterStatus, filterMonth, filterYear]);

  const hasActiveFilter = Boolean(
    filterPatient || filterPlan || filterStatus || filterMonth !== "" || filterYear !== "",
  );

  function clearFilters() {
    setFilterPatient("");
    setFilterPlan("");
    setFilterStatus("");
    setFilterMonth("");
    setFilterYear("");
  }

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startNew() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(inv: Invoice) {
    setEditingId(inv.id);
    setShowForm(true);
    setForm({
      number: inv.number ?? "",
      issue_date: inv.issue_date.slice(0, 10),
      patient_id: inv.patient_id ?? "",
      patient_name: inv.patient_name,
      reference_year: inv.reference_year,
      reference_month: inv.reference_month,
      health_plan_name: inv.health_plan_name ?? "",
      gross_value: inv.gross_value.toString().replace(".", ","),
      net_value: inv.net_value.toString().replace(".", ","),
      taxes: inv.taxes.toString().replace(".", ","),
      notes: inv.notes ?? "",
      status: inv.status,
    });
  }

  function onSelectPatient(value: string) {
    if (!value) {
      setForm((f) => ({ ...f, patient_id: "" }));
      return;
    }
    const pid = Number(value);
    const p = patients.find((x) => x.id === pid);
    const planName = p
      ? plans.find((pl) => pl.id === p.health_plan_id)?.name ?? ""
      : "";
    setForm((f) => ({
      ...f,
      patient_id: pid,
      patient_name: p?.name ?? f.patient_name,
      health_plan_name: planName || f.health_plan_name,
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_name.trim()) {
      setError("Informe o paciente.");
      return;
    }
    try {
      const payload = {
        number: form.number.trim() || null,
        issue_date: form.issue_date,
        patient_id: form.patient_id === "" ? null : Number(form.patient_id),
        patient_name: form.patient_name.trim(),
        reference_year: form.reference_year,
        reference_month: form.reference_month,
        health_plan_name: form.health_plan_name.trim() || null,
        gross_value: parseBRLNumber(form.gross_value),
        net_value: parseBRLNumber(form.net_value),
        taxes: parseBRLNumber(form.taxes),
        notes: form.notes.trim() || null,
        status: form.status,
      };
      if (editingId) {
        await api.put(`/api/invoices/${editingId}`, payload);
      } else {
        await api.post("/api/invoices", payload);
      }
      resetForm();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function changeStatus(id: number, status: InvoiceStatus) {
    try {
      await api.put(`/api/invoices/${id}`, { status });
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status } : it)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remover esta nota fiscal?")) return;
    try {
      await api.del(`/api/invoices/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Notas fiscais"
        subtitle="Cadastro e acompanhamento de notas fiscais emitidas"
        actions={
          !showForm ? (
            <Button onClick={startNew}>+ Nova nota</Button>
          ) : (
            <Button variant="secondary" onClick={resetForm}>
              Fechar formulário
            </Button>
          )
        }
      >
        {showForm && (
          <form
            onSubmit={save}
            className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-2"
          >
            <div className="flex flex-col gap-1">
              <Label>Número da nota</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Data de emissão</Label>
              <Input
                type="date"
                value={form.issue_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issue_date: e.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <Label>Paciente</Label>
              <Select
                value={form.patient_id}
                onChange={(e) => onSelectPatient(e.target.value)}
              >
                <option value="">— selecionar paciente cadastrado —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input
                value={form.patient_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, patient_name: e.target.value }))
                }
                placeholder="Nome do paciente"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label>Mês de referência</Label>
              <Select
                value={form.reference_month}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reference_month: Number(e.target.value) }))
                }
              >
                {MONTHS.map((m, idx) => (
                  <option key={idx} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Ano de referência</Label>
              <Select
                value={form.reference_year}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reference_year: Number(e.target.value) }))
                }
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2 flex flex-col gap-1">
              <Label>Plano de saúde</Label>
              <Input
                value={form.health_plan_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, health_plan_name: e.target.value }))
                }
                placeholder="Nome do plano de saúde"
                list="health-plan-options"
              />
              <datalist id="health-plan-options">
                {plans.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Valor bruto</Label>
              <Input
                value={form.gross_value}
                onChange={(e) => {
                  const raw = e.target.value;
                  setForm((f) => {
                    if (!autoTaxes) return { ...f, gross_value: raw };
                    const gross = parseBRLNumber(raw);
                    const { taxes, net } = computeTaxes(gross);
                    return {
                      ...f,
                      gross_value: raw,
                      taxes: gross > 0 ? formatDecimal(taxes) : "",
                      net_value: gross > 0 ? formatDecimal(net) : "",
                    };
                  });
                }}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Impostos</Label>
              <Input
                value={form.taxes}
                onChange={(e) => {
                  const raw = e.target.value;
                  setForm((f) => {
                    if (!autoTaxes) return { ...f, taxes: raw };
                    const gross = parseBRLNumber(f.gross_value);
                    const taxes = parseBRLNumber(raw);
                    const net = Math.round((gross - taxes) * 100) / 100;
                    return {
                      ...f,
                      taxes: raw,
                      net_value: gross > 0 ? formatDecimal(net) : f.net_value,
                    };
                  });
                }}
                placeholder="0,00"
                inputMode="decimal"
              />
              <div className="text-[11px] text-slate-500">
                IRRF 1,50% + PIS 0,65% + COFINS 3% + CSLL 1% = 6,15%
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Valor líquido</Label>
              <Input
                value={form.net_value}
                onChange={(e) =>
                  setForm((f) => ({ ...f, net_value: e.target.value }))
                }
                placeholder="0,00"
                inputMode="decimal"
              />
              <label className="flex items-center gap-1 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={autoTaxes}
                  onChange={(e) => setAutoTaxes(e.target.checked)}
                />
                Calcular impostos e líquido automaticamente
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Status</Label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as InvoiceStatus }))
                }
              >
                {INVOICE_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {INVOICE_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="md:col-span-4 flex flex-col gap-1">
              <Label>Observações</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                placeholder="Opcional"
              />
            </div>
            <div className="md:col-span-4 flex items-center gap-2">
              <Button type="submit">
                {editingId ? "Salvar alterações" : "Cadastrar nota"}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      </Card>

      <Card
        title="Notas cadastradas"
        subtitle={
          hasActiveFilter
            ? `${filtered.length} de ${items.length} nota(s) (filtros ativos)`
            : `${items.length} nota(s) registrada(s)`
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => setPrinting(true)}
            disabled={filtered.length === 0}
          >
            Imprimir lista
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label>Filtrar por paciente</Label>
            <Input
              value={filterPatient}
              onChange={(e) => setFilterPatient(e.target.value)}
              placeholder="Digite parte do nome"
              list="filter-patient-options"
            />
            <datalist id="filter-patient-options">
              {patients.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label>Plano de saúde</Label>
            <Select
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
            >
              <option value="">Todos</option>
              {distinctPlanNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Mês (referente)</Label>
            <Select
              value={filterMonth}
              onChange={(e) =>
                setFilterMonth(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">Todos</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Ano (referente)</Label>
            <Select
              value={filterYear}
              onChange={(e) =>
                setFilterYear(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">Todos</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label>Status</Label>
            <Select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as InvoiceStatus | "")
              }
            >
              <option value="">Todos</option>
              {INVOICE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          {hasActiveFilter && (
            <div className="md:col-span-6">
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            Nenhuma nota cadastrada ainda. Clique em "+ Nova nota" para começar.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            Nenhuma nota corresponde aos filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Nº</th>
                  <th className="text-left px-3 py-2">Tomador</th>
                  <th className="text-left px-3 py-2">Emissão</th>
                  <th className="text-left px-3 py-2">Paciente</th>
                  <th className="text-left px-3 py-2">Referente</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">Líquido</th>
                  <th className="text-right px-3 py-2">Impostos</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2">{inv.number || "—"}</td>
                    <td className="px-3 py-2">{inv.health_plan_name || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatIsoDate(inv.issue_date)}
                    </td>
                    <td className="px-3 py-2">{inv.patient_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {MONTHS[inv.reference_month - 1]}/{inv.reference_year}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatBRL(inv.gross_value)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatBRL(inv.net_value)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatBRL(inv.taxes)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                            inv.status,
                          )}`}
                        >
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                        <Select
                          value={inv.status}
                          onChange={(e) =>
                            changeStatus(inv.id, e.target.value as InvoiceStatus)
                          }
                          className="text-xs"
                        >
                          {INVOICE_STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {INVOICE_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex flex-wrap gap-1 justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setViewInvoice(inv)}
                        >
                          Ver
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => startEdit(inv)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => remove(inv.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InvoiceViewModal
        invoice={viewInvoice}
        onClose={() => setViewInvoice(null)}
      />
      <InvoiceListPrintFrame
        active={printing}
        invoices={filtered}
        filters={{
          patient: filterPatient,
          plan: filterPlan,
          status: filterStatus,
          month: filterMonth,
          year: filterYear,
        }}
        onDone={() => setPrinting(false)}
      />
    </div>
  );
}

function InvoiceViewModal({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  if (!invoice) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto print:hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">
              Nota fiscal {invoice.number ? `nº ${invoice.number}` : `#${invoice.id}`}
            </h3>
            <p className="text-xs text-slate-500">
              {MONTHS[invoice.reference_month - 1]}/{invoice.reference_year} ·{" "}
              Emitida em {formatIsoDate(invoice.issue_date)}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
              invoice.status,
            )}`}
          >
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <InvoiceDetailGrid invoice={invoice} />
          {invoice.notes && (
            <div>
              <div className="font-medium text-slate-700 mb-1">Observações</div>
              <pre className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-md p-3 font-sans text-sm">
{invoice.notes}
              </pre>
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-3 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDetailGrid({ invoice }: { invoice: Invoice }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
      <DetailItem label="Número" value={invoice.number || "—"} />
      <DetailItem label="Data de emissão" value={formatIsoDate(invoice.issue_date)} />
      <DetailItem label="Paciente" value={invoice.patient_name} />
      <DetailItem
        label="Referente a"
        value={`${MONTHS[invoice.reference_month - 1]}/${invoice.reference_year}`}
      />
      <DetailItem label="Plano de saúde" value={invoice.health_plan_name || "—"} />
      <DetailItem label="Status" value={INVOICE_STATUS_LABELS[invoice.status]} />
      <DetailItem label="Valor bruto" value={formatBRL(invoice.gross_value)} />
      <DetailItem label="Impostos" value={formatBRL(invoice.taxes)} />
      <DetailItem
        label="Valor líquido"
        value={formatBRL(invoice.net_value)}
        strong
      />
    </div>
  );
}

function DetailItem({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={strong ? "font-semibold" : "font-medium"}>{value}</div>
    </div>
  );
}

type ListPrintFilters = {
  patient: string;
  plan: string;
  status: InvoiceStatus | "";
  month: number | "";
  year: number | "";
};

function InvoiceListPrintFrame({
  active,
  invoices,
  filters,
  onDone,
}: {
  active: boolean;
  invoices: Invoice[];
  filters: ListPrintFilters;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      window.print();
    }, 100);
    function afterPrint() {
      onDone();
    }
    window.addEventListener("afterprint", afterPrint);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [active, onDone]);

  if (!active) return null;

  const totalGross = invoices.reduce((s, i) => s + i.gross_value, 0);
  const totalTaxes = invoices.reduce((s, i) => s + i.taxes, 0);
  const totalNet = invoices.reduce((s, i) => s + i.net_value, 0);

  const activeFilters: string[] = [];
  if (filters.patient) activeFilters.push(`Paciente: ${filters.patient}`);
  if (filters.plan) activeFilters.push(`Plano: ${filters.plan}`);
  if (filters.month !== "")
    activeFilters.push(`Mês: ${MONTHS[(filters.month as number) - 1]}`);
  if (filters.year !== "") activeFilters.push(`Ano: ${filters.year}`);
  if (filters.status)
    activeFilters.push(`Status: ${INVOICE_STATUS_LABELS[filters.status]}`);

  return (
    <div className="invoice-print-area">
      <div className="p-6 text-slate-900">
        <div className="border-b border-slate-300 pb-2 mb-3">
          <h1 className="text-lg font-bold">Relação de notas fiscais</h1>
          <div className="text-xs text-slate-600 mt-1">
            {activeFilters.length > 0
              ? `Filtros: ${activeFilters.join(" · ")}`
              : "Sem filtros aplicados (todas as notas)"}
          </div>
          <div className="text-xs text-slate-600">
            Gerado em {new Date().toLocaleString("pt-BR")} · {invoices.length}{" "}
            nota(s)
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="text-sm text-slate-600 py-4">
            Nenhuma nota corresponde aos filtros.
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-400">
                <th className="text-left px-2 py-1">Nº</th>
                <th className="text-left px-2 py-1">Tomador</th>
                <th className="text-left px-2 py-1">Emissão</th>
                <th className="text-left px-2 py-1">Paciente</th>
                <th className="text-left px-2 py-1">Referente</th>
                <th className="text-right px-2 py-1">Bruto</th>
                <th className="text-right px-2 py-1">Impostos</th>
                <th className="text-right px-2 py-1">Líquido</th>
                <th className="text-left px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-200 align-top">
                  <td className="px-2 py-1">{inv.number || "—"}</td>
                  <td className="px-2 py-1">{inv.health_plan_name || "—"}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {formatIsoDate(inv.issue_date)}
                  </td>
                  <td className="px-2 py-1">{inv.patient_name}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {MONTHS[inv.reference_month - 1]}/{inv.reference_year}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {formatBRL(inv.gross_value)}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {formatBRL(inv.taxes)}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {formatBRL(inv.net_value)}
                  </td>
                  <td className="px-2 py-1">
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-400 font-semibold">
                <td className="px-2 py-1" colSpan={5}>
                  Totais ({invoices.length} nota{invoices.length === 1 ? "" : "s"})
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {formatBRL(totalGross)}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {formatBRL(totalTaxes)}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {formatBRL(totalNet)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
