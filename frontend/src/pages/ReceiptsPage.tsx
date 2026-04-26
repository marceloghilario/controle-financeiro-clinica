import { useEffect, useMemo, useState } from "react";
import {
  api,
  INVOICE_STATUS_LABELS,
  type HealthPlan,
  type InvoiceStatus,
  type InvoiceSubsetSuggestion,
  type InvoiceSuggestionsResponse,
  type Patient,
  type PayerType,
  type Receipt,
  type ReceiptInput,
  type ReceiptInvoiceSummary,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { formatBRL, formatIsoDate, MONTHS } from "../utils";

const PAID_STATUSES: InvoiceStatus[] = [
  "paga",
  "paga_parcial",
  "paga_excedente",
];

function parseBRL(v: string): number {
  if (!v) return 0;
  const n = Number(v.replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatBRLPlain(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const PAYER_LABELS: Record<PayerType, string> = {
  health_plan: "Plano de saúde",
  patient: "Paciente",
  other: "Outro",
};

type FormState = {
  payment_date: string;
  value: string;
  payer_type: PayerType;
  payer_health_plan_id: number | "";
  payer_patient_id: number | "";
  payer_name: string;
  linked_status: InvoiceStatus;
  status_overridden: boolean;
  notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  payment_date: today(),
  value: "",
  payer_type: "health_plan",
  payer_health_plan_id: "",
  payer_patient_id: "",
  payer_name: "",
  linked_status: "paga",
  status_overridden: false,
  notes: "",
});

function suggestStatus(value: number, sumNet: number): InvoiceStatus {
  if (sumNet <= 0) return "paga";
  const diff = value - sumNet;
  if (Math.abs(diff) < 0.01) return "paga";
  if (diff < 0) return "paga_parcial";
  return "paga_excedente";
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [healthPlans, setHealthPlans] = useState<HealthPlan[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(
    new Set(),
  );
  const [suggestions, setSuggestions] = useState<InvoiceSubsetSuggestion[]>([]);
  const [candidates, setCandidates] = useState<ReceiptInvoiceSummary[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // filtros da lista
  const [filterPayer, setFilterPayer] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  async function loadReceipts() {
    try {
      const r = await api.get<Receipt[]>("/api/receipts");
      setReceipts(r);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    Promise.all([
      api.get<HealthPlan[]>("/api/health-plans"),
      api.get<Patient[]>("/api/patients"),
    ])
      .then(([hp, p]) => {
        setHealthPlans(hp);
        setPatients(p);
      })
      .catch((e) => setError((e as Error).message));
    loadReceipts();
  }, []);

  // dispara busca de sugestões quando muda pagador ou valor
  useEffect(() => {
    const value = parseBRL(form.value);
    const hasPayer =
      (form.payer_type === "health_plan" && form.payer_health_plan_id !== "") ||
      (form.payer_type === "patient" && form.payer_patient_id !== "") ||
      (form.payer_type === "other" && form.payer_name.trim() !== "");
    if (!hasPayer || value <= 0) {
      setSuggestions([]);
      if (form.payer_type !== "other") setCandidates([]);
      return;
    }
    if (form.payer_type === "other") {
      setSuggestions([]);
      setCandidates([]);
      return;
    }
    const params = new URLSearchParams();
    params.set("payer_type", form.payer_type);
    params.set("value", String(value));
    if (form.payer_type === "health_plan" && form.payer_health_plan_id !== "") {
      params.set("payer_health_plan_id", String(form.payer_health_plan_id));
    }
    if (form.payer_type === "patient" && form.payer_patient_id !== "") {
      params.set("payer_patient_id", String(form.payer_patient_id));
    }
    setLoadingSuggestions(true);
    api
      .get<InvoiceSuggestionsResponse>(`/api/receipts/suggestions?${params}`)
      .then((r) => {
        setCandidates(r.candidates);
        setSuggestions(r.suggestions);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingSuggestions(false));
  }, [
    form.payer_type,
    form.payer_health_plan_id,
    form.payer_patient_id,
    form.value,
  ]);

  function resetForm() {
    setForm(emptyForm());
    setSelectedInvoiceIds(new Set());
    setSuggestions([]);
    setCandidates([]);
    setEditingId(null);
  }

  function toggleInvoice(id: number) {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applySuggestion(s: InvoiceSubsetSuggestion) {
    setSelectedInvoiceIds(new Set(s.invoice_ids));
  }

  async function startEdit(r: Receipt) {
    setEditingId(r.id);
    setForm({
      payment_date: r.payment_date,
      value: formatBRLPlain(r.value),
      payer_type: r.payer_type,
      payer_health_plan_id: r.payer_health_plan_id ?? "",
      payer_patient_id: r.payer_patient_id ?? "",
      payer_name: r.payer_name,
      linked_status: r.linked_status ?? "paga",
      status_overridden: true, // mantém o status escolhido anteriormente
      notes: r.notes ?? "",
    });
    setSelectedInvoiceIds(new Set(r.invoices.map((i) => i.id)));
    // garante que as notas vinculadas apareçam mesmo se já estão pagas
    const ids = r.invoices.map((i) => i.id);
    if (ids.length > 0) {
      // adiciona temporariamente — o useEffect vai recarregar candidates do backend
      setCandidates(r.invoices);
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setError(null);
    const value = parseBRL(form.value);
    if (value <= 0) {
      setError("Informe o valor do recebimento.");
      return;
    }
    if (form.payer_type === "health_plan" && form.payer_health_plan_id === "") {
      setError("Selecione o plano de saúde pagador.");
      return;
    }
    if (form.payer_type === "patient" && form.payer_patient_id === "") {
      setError("Selecione o paciente pagador.");
      return;
    }
    if (form.payer_type === "other" && !form.payer_name.trim()) {
      setError("Informe o nome do pagador.");
      return;
    }
    const body: ReceiptInput = {
      payment_date: form.payment_date,
      value,
      payer_type: form.payer_type,
      payer_health_plan_id:
        form.payer_type === "health_plan" && form.payer_health_plan_id !== ""
          ? Number(form.payer_health_plan_id)
          : null,
      payer_patient_id:
        form.payer_type === "patient" && form.payer_patient_id !== ""
          ? Number(form.payer_patient_id)
          : null,
      payer_name: form.payer_name.trim(),
      linked_status:
        selectedInvoiceIds.size > 0 ? form.linked_status : null,
      notes: form.notes.trim() || null,
      invoice_ids: Array.from(selectedInvoiceIds),
    };
    try {
      if (editingId) {
        await api.put(`/api/receipts/${editingId}`, body);
      } else {
        await api.post("/api/receipts", body);
      }
      resetForm();
      await loadReceipts();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (
      !confirm(
        "Excluir o recebimento? As notas vinculadas voltarão para o status anterior.",
      )
    )
      return;
    try {
      await api.del(`/api/receipts/${id}`);
      if (editingId === id) resetForm();
      await loadReceipts();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const targetValue = parseBRL(form.value);
  const selectedSummary = useMemo(() => {
    const list = candidates.filter((c) => selectedInvoiceIds.has(c.id));
    const sumGross = list.reduce((s, i) => s + i.gross_value, 0);
    const sumNet = list.reduce((s, i) => s + i.net_value, 0);
    return { count: list.length, sumGross, sumNet };
  }, [candidates, selectedInvoiceIds]);

  const suggestedStatus = useMemo(
    () =>
      selectedSummary.count > 0
        ? suggestStatus(targetValue, selectedSummary.sumNet)
        : "paga",
    [targetValue, selectedSummary],
  );

  // auto-aplica o status sugerido enquanto o usuário não tiver editado manualmente
  useEffect(() => {
    if (form.status_overridden) return;
    if (selectedInvoiceIds.size === 0) return;
    setForm((f) =>
      f.linked_status === suggestedStatus ? f : { ...f, linked_status: suggestedStatus },
    );
  }, [suggestedStatus, selectedInvoiceIds, form.status_overridden]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (
        filterPayer &&
        !r.payer_name.toLowerCase().includes(filterPayer.toLowerCase())
      )
        return false;
      if (filterStartDate && r.payment_date < filterStartDate) return false;
      if (filterEndDate && r.payment_date > filterEndDate) return false;
      return true;
    });
  }, [receipts, filterPayer, filterStartDate, filterEndDate]);

  return (
    <div className="space-y-4">
      <Card
        title={editingId ? "Editar recebimento" : "Novo recebimento"}
        subtitle="Cadastre o pagamento e vincule as notas correspondentes. O sistema sugere combinações com base no valor."
      >
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={form.payment_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, payment_date: e.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <Label>Valor pago</Label>
            <Input
              inputMode="decimal"
              placeholder="0,00"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Tipo de pagador</Label>
            <Select
              value={form.payer_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  payer_type: e.target.value as PayerType,
                  payer_health_plan_id: "",
                  payer_patient_id: "",
                  payer_name: "",
                }))
              }
            >
              <option value="health_plan">Plano de saúde</option>
              <option value="patient">Paciente</option>
              <option value="other">Outro</option>
            </Select>
          </div>
          <div className="md:col-span-6">
            <Label>Pagador</Label>
            {form.payer_type === "health_plan" && (
              <Select
                value={form.payer_health_plan_id}
                onChange={(e) => {
                  const id = e.target.value === "" ? "" : Number(e.target.value);
                  const plan = healthPlans.find((p) => p.id === id);
                  setForm((f) => ({
                    ...f,
                    payer_health_plan_id: id,
                    payer_name: plan?.name ?? "",
                  }));
                }}
              >
                <option value="">Selecione o plano…</option>
                {healthPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            {form.payer_type === "patient" && (
              <Select
                value={form.payer_patient_id}
                onChange={(e) => {
                  const id = e.target.value === "" ? "" : Number(e.target.value);
                  const pat = patients.find((p) => p.id === id);
                  setForm((f) => ({
                    ...f,
                    payer_patient_id: id,
                    payer_name: pat?.name ?? "",
                  }));
                }}
              >
                <option value="">Selecione o paciente…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.health_plan_name ?? "—"}
                  </option>
                ))}
              </Select>
            )}
            {form.payer_type === "other" && (
              <Input
                placeholder="Nome do pagador"
                value={form.payer_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payer_name: e.target.value }))
                }
              />
            )}
          </div>
          <div className="md:col-span-12">
            <Label>Observações</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex: depósito identificado, comprovante etc."
            />
          </div>
        </div>

        {form.payer_type !== "other" && (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-slate-700">
                Notas vinculadas a este recebimento
              </div>
              <div className="text-xs text-slate-500">
                {loadingSuggestions
                  ? "Buscando sugestões…"
                  : candidates.length > 0
                    ? `${candidates.length} nota(s) em aberto/emitida/enviada para este pagador`
                    : targetValue > 0
                      ? "Nenhuma nota em aberto encontrada para este pagador"
                      : "Informe o valor para buscar sugestões"}
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-slate-600 mb-1">
                  Sugestões (clique para preencher):
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, idx) => {
                    const exact = s.diff_net < 0.01 || s.diff_gross < 0.01;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => applySuggestion(s)}
                        className={`text-left text-xs rounded-md border px-2 py-1 hover:bg-slate-50 ${
                          exact
                            ? "border-emerald-400 bg-emerald-50"
                            : "border-slate-300 bg-white"
                        }`}
                        title={`Líq: ${formatBRL(s.sum_net)} · Bruto: ${formatBRL(
                          s.sum_gross,
                        )} · diff líq: ${formatBRL(s.diff_net)}`}
                      >
                        <div className="font-medium">
                          {s.invoice_ids.length === 1
                            ? "1 nota"
                            : `${s.invoice_ids.length} notas`}{" "}
                          · líq {formatBRL(s.sum_net)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          diferença líq {formatBRL(s.diff_net)}
                          {exact ? " · combinação exata" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs">
                    <tr>
                      <th className="px-2 py-1 w-10" />
                      <th className="text-left px-2 py-1">Nº</th>
                      <th className="text-left px-2 py-1">Emissão</th>
                      <th className="text-left px-2 py-1">Paciente</th>
                      <th className="text-left px-2 py-1">Referente</th>
                      <th className="text-right px-2 py-1">Bruto</th>
                      <th className="text-right px-2 py-1">Líquido</th>
                      <th className="text-left px-2 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {candidates.map((c) => {
                      const checked = selectedInvoiceIds.has(c.id);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => toggleInvoice(c.id)}
                          className={`cursor-pointer ${
                            checked ? "bg-emerald-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInvoice(c.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="px-2 py-1">{c.number || "—"}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {formatIsoDate(c.issue_date)}
                          </td>
                          <td className="px-2 py-1">{c.patient_name}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {MONTHS[c.reference_month - 1]}/{c.reference_year}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {formatBRL(c.gross_value)}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {formatBRL(c.net_value)}
                          </td>
                          <td className="px-2 py-1 text-xs">
                            {INVOICE_STATUS_LABELS[c.status]}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {targetValue > 0 && (
              <div className="text-xs text-slate-600 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Selecionadas: <strong>{selectedSummary.count}</strong> nota(s)
                </span>
                <span>
                  Soma bruto:{" "}
                  <strong>{formatBRL(selectedSummary.sumGross)}</strong>
                </span>
                <span>
                  Soma líquida:{" "}
                  <strong>{formatBRL(selectedSummary.sumNet)}</strong>
                </span>
                <span>
                  Valor pago: <strong>{formatBRL(targetValue)}</strong>
                </span>
                <span>
                  Diferença (vs. líq):{" "}
                  <strong
                    className={
                      Math.abs(selectedSummary.sumNet - targetValue) < 0.01
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }
                  >
                    {formatBRL(selectedSummary.sumNet - targetValue)}
                  </strong>
                </span>
              </div>
            )}

            {selectedInvoiceIds.size > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
                <div className="min-w-[220px]">
                  <Label>Status a aplicar nas notas vinculadas</Label>
                  <Select
                    value={form.linked_status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        linked_status: e.target.value as InvoiceStatus,
                        status_overridden: true,
                      }))
                    }
                  >
                    {PAID_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {INVOICE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="text-xs text-slate-600 flex flex-col gap-0.5 pb-1.5">
                  <span>
                    Sugestão automática:{" "}
                    <strong>{INVOICE_STATUS_LABELS[suggestedStatus]}</strong>
                    {form.status_overridden &&
                      form.linked_status !== suggestedStatus && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              linked_status: suggestedStatus,
                              status_overridden: false,
                            }))
                          }
                          className="ml-2 underline text-slate-700 hover:text-slate-900"
                        >
                          aplicar sugestão
                        </button>
                      )}
                  </span>
                  <span className="text-slate-500">
                    {targetValue > 0 && selectedSummary.sumNet > 0
                      ? `Pago ${formatBRL(targetValue)} vs. soma líq ${formatBRL(
                          selectedSummary.sumNet,
                        )}`
                      : "Informe o valor e selecione pelo menos uma nota"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button onClick={save}>
            {editingId ? "Salvar alterações" : "Cadastrar recebimento"}
          </Button>
          <Button variant="secondary" onClick={resetForm}>
            {editingId ? "Cancelar edição" : "Limpar"}
          </Button>
        </div>
      </Card>

      <Card title="Recebimentos cadastrados">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div>
            <Label>Pagador</Label>
            <Input
              placeholder="Filtrar por nome…"
              value={filterPayer}
              onChange={(e) => setFilterPayer(e.target.value)}
            />
          </div>
          <div>
            <Label>De</Label>
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Até</Label>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="secondary"
              onClick={() => {
                setFilterPayer("");
                setFilterStartDate("");
                setFilterEndDate("");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="text-sm text-slate-500">Nenhum recebimento.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Pagador</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="text-left px-3 py-2">Notas vinculadas</th>
                  <th className="text-left px-3 py-2">Observações</th>
                  <th className="text-right px-3 py-2 w-40" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReceipts.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatIsoDate(r.payment_date)}
                    </td>
                    <td className="px-3 py-2">{r.payer_name}</td>
                    <td className="px-3 py-2 text-xs">
                      {PAYER_LABELS[r.payer_type]}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatBRL(r.value)}
                    </td>
                    <td className="px-3 py-2">
                      {r.invoices.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          Sem vínculo
                        </span>
                      ) : (
                        <ul className="text-xs space-y-0.5">
                          {r.invoices.map((i) => (
                            <li key={i.id}>
                              Nº {i.number || "—"} · {i.patient_name} ·{" "}
                              {MONTHS[i.reference_month - 1]}/
                              {i.reference_year} ·{" "}
                              {formatBRL(i.net_value)} (líq)
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.notes || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex flex-wrap gap-1 justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => startEdit(r)}
                        >
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => remove(r.id)}
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
    </div>
  );
}
