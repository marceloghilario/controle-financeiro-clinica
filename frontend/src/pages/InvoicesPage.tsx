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
import { MONTHS, formatBRL } from "../utils";

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
                onChange={(e) =>
                  setForm((f) => ({ ...f, gross_value: e.target.value }))
                }
                placeholder="0,00"
                inputMode="decimal"
              />
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
            </div>
            <div className="flex flex-col gap-1">
              <Label>Impostos</Label>
              <Input
                value={form.taxes}
                onChange={(e) => setForm((f) => ({ ...f, taxes: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
              />
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
        subtitle={`${items.length} nota(s) registrada(s)`}
      >
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 py-6 text-center">
            Nenhuma nota cadastrada ainda. Clique em "+ Nova nota" para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Nº</th>
                  <th className="text-left px-3 py-2">Emissão</th>
                  <th className="text-left px-3 py-2">Paciente</th>
                  <th className="text-left px-3 py-2">Referente</th>
                  <th className="text-left px-3 py-2">Plano</th>
                  <th className="text-right px-3 py-2">Bruto</th>
                  <th className="text-right px-3 py-2">Líquido</th>
                  <th className="text-right px-3 py-2">Impostos</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2">{inv.number || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatIsoDate(inv.issue_date)}
                    </td>
                    <td className="px-3 py-2">{inv.patient_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {MONTHS[inv.reference_month - 1]}/{inv.reference_year}
                    </td>
                    <td className="px-3 py-2">{inv.health_plan_name || "—"}</td>
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
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
