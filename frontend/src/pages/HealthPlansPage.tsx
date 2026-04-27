import { useEffect, useMemo, useState } from "react";
import {
  api,
  type HealthPlan,
  type Specialty,
  type SpecialtyPrice,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { formatBRL, formatCNPJ, isValidCNPJ, maskCNPJ, onlyDigits } from "../utils";

export default function HealthPlansPage() {
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [prices, setPrices] = useState<SpecialtyPrice[]>([]);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCnpj, setEditCnpj] = useState("");
  const [editNotes, setEditNotes] = useState("");

  async function load() {
    const [p, s, pr] = await Promise.all([
      api.get<HealthPlan[]>("/api/health-plans"),
      api.get<Specialty[]>("/api/specialties"),
      api.get<SpecialtyPrice[]>("/api/specialty-prices"),
    ]);
    setPlans(p);
    setSpecialties(s);
    setPrices(pr);
  }

  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const cnpjDigits = onlyDigits(cnpj);
    if (cnpjDigits && !isValidCNPJ(cnpjDigits)) {
      setError("CNPJ inválido. Verifique os dígitos.");
      return;
    }
    try {
      await api.post("/api/health-plans", {
        name,
        cnpj: cnpjDigits ? maskCNPJ(cnpjDigits) : null,
        notes: notes.trim() || null,
      });
      setName("");
      setCnpj("");
      setNotes("");
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(p: HealthPlan) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditCnpj(p.cnpj ? maskCNPJ(p.cnpj) : "");
    setEditNotes(p.notes ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditCnpj("");
    setEditNotes("");
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    const cnpjDigits = onlyDigits(editCnpj);
    if (cnpjDigits && !isValidCNPJ(cnpjDigits)) {
      setError("CNPJ inválido. Verifique os dígitos.");
      return;
    }
    try {
      await api.put(`/api/health-plans/${id}`, {
        name: editName,
        cnpj: cnpjDigits ? maskCNPJ(cnpjDigits) : null,
        notes: editNotes.trim() || null,
      });
      cancelEdit();
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (
      !confirm(
        "Remover este plano? Os pacientes vinculados precisarão ser ajustados."
      )
    )
      return;
    try {
      await api.del(`/api/health-plans/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleExpand(planId: number) {
    setExpanded((prev) => ({ ...prev, [planId]: !prev[planId] }));
  }

  return (
    <Card
      title="Planos de saúde"
      subtitle="Cadastre os convênios e, em cada um, as terapias atendidas com valor e código (opcional)"
    >
      <form onSubmit={add} className="grid gap-2 mb-4 sm:grid-cols-[1fr_180px_auto]">
        <Input
          placeholder="Nome do plano (ex: Unimed)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex flex-col gap-1">
          <Input
            placeholder="CNPJ (opcional)"
            value={cnpj}
            onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
            inputMode="numeric"
            maxLength={18}
          />
          {cnpj && onlyDigits(cnpj).length === 14 && !isValidCNPJ(cnpj) && (
            <span className="text-xs text-red-600">CNPJ inválido</span>
          )}
        </div>
        <Button type="submit">Adicionar plano</Button>
        <textarea
          placeholder="Observação (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="sm:col-span-3 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 min-h-[60px]"
        />
      </form>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {plans.length === 0 ? (
        <div className="text-sm text-slate-500 py-2">
          Nenhum plano cadastrado.
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
          {plans.map((p) => {
            const planPrices = prices.filter((x) => x.health_plan_id === p.id);
            const isOpen = !!expanded[p.id];
            return (
              <li key={p.id}>
                <div className="flex items-center justify-between bg-white px-3 py-2 gap-3">
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <span
                      className={`inline-block transition-transform ${
                        isOpen ? "rotate-90" : ""
                      } text-slate-400`}
                    >
                      ▶
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.name}</span>
                        {p.cnpj && (
                          <span className="text-xs text-slate-500">
                            CNPJ {formatCNPJ(p.cnpj)}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          ({planPrices.length} terapia
                          {planPrices.length === 1 ? "" : "s"})
                        </span>
                      </div>
                      {p.notes && (
                        <div className="text-xs text-slate-500 truncate max-w-xl">
                          {p.notes}
                        </div>
                      )}
                    </div>
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="ghost" onClick={() => startEdit(p)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => toggleExpand(p.id)}
                    >
                      {isOpen ? "Recolher" : "Gerenciar terapias"}
                    </Button>
                    <Button variant="ghost" onClick={() => remove(p.id)}>
                      Remover
                    </Button>
                  </div>
                </div>
                {editingId === p.id && (
                  <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 grid gap-2 sm:grid-cols-[1fr_180px]">
                    <div>
                      <Label>Nome</Label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>CNPJ</Label>
                      <Input
                        value={editCnpj}
                        onChange={(e) => setEditCnpj(maskCNPJ(e.target.value))}
                        inputMode="numeric"
                        maxLength={18}
                      />
                      {editCnpj &&
                        onlyDigits(editCnpj).length === 14 &&
                        !isValidCNPJ(editCnpj) && (
                          <span className="text-xs text-red-600">
                            CNPJ inválido
                          </span>
                        )}
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Observação</Label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 min-h-[60px]"
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <Button variant="ghost" onClick={cancelEdit}>
                        Cancelar
                      </Button>
                      <Button onClick={() => saveEdit(p.id)}>Salvar</Button>
                    </div>
                  </div>
                )}
                {isOpen && (
                  <div className="bg-slate-50 px-4 py-3 border-t border-slate-200">
                    <PlanTherapiesEditor
                      planId={p.id}
                      planName={p.name}
                      specialties={specialties}
                      prices={planPrices}
                      onChanged={load}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PlanTherapiesEditor({
  planId,
  planName,
  specialties,
  prices,
  onChanged,
}: {
  planId: number;
  planName: string;
  specialties: Specialty[];
  prices: SpecialtyPrice[];
  onChanged: () => Promise<void>;
}) {
  const [specId, setSpecId] = useState<number | "">("");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editCode, setEditCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const specialtyOptions = useMemo(() => {
    const usedIds = new Set(prices.map((p) => p.specialty_id));
    return specialties.filter((s) => !usedIds.has(s.id));
  }, [specialties, prices]);

  function resetForm() {
    setSpecId("");
    setValue("");
    setCode("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (specId === "" || value === "") return;
    try {
      await api.post("/api/specialty-prices", {
        health_plan_id: planId,
        specialty_id: Number(specId),
        value: Number(value.replace(",", ".")),
        therapy_code: code.trim() || null,
      });
      resetForm();
      setError(null);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(price: SpecialtyPrice) {
    setEditingId(price.id);
    setEditValue(String(price.value));
    setEditCode(price.therapy_code ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setEditCode("");
  }

  async function saveEdit(price: SpecialtyPrice) {
    try {
      await api.post("/api/specialty-prices", {
        health_plan_id: price.health_plan_id,
        specialty_id: price.specialty_id,
        value: Number(editValue.replace(",", ".")),
        therapy_code: editCode.trim() || null,
      });
      cancelEdit();
      setError(null);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(price: SpecialtyPrice) {
    if (!confirm(`Remover ${price.specialty_name} de ${planName}?`)) return;
    try {
      await api.del(`/api/specialty-prices/${price.id}`);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left px-3 py-2">Terapia / especialidade</th>
              <th className="text-right px-3 py-2">Valor por sessão</th>
              <th className="text-left px-3 py-2">Código (opcional)</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {prices.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-3 text-center text-slate-500"
                >
                  Nenhuma terapia cadastrada para este plano.
                </td>
              </tr>
            )}
            {prices.map((price) => {
              const isEditing = editingId === price.id;
              return (
                <tr key={price.id}>
                  <td className="px-3 py-2">{price.specialty_name}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-28 text-right"
                      />
                    ) : (
                      formatBRL(price.value)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Input
                        type="text"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        placeholder="—"
                        className="w-32"
                      />
                    ) : (
                      price.therapy_code ?? (
                        <span className="text-slate-400">—</span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {isEditing ? (
                      <>
                        <Button
                          variant="primary"
                          onClick={() => saveEdit(price)}
                          className="mr-1"
                        >
                          Salvar
                        </Button>
                        <Button variant="ghost" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => startEdit(price)}
                          className="mr-1"
                        >
                          Editar
                        </Button>
                        <Button variant="ghost" onClick={() => remove(price)}>
                          Excluir
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={save}
        className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end"
      >
        <div className="flex flex-col gap-1">
          <Label>Terapia</Label>
          <Select
            value={specId}
            onChange={(e) =>
              setSpecId(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">Selecione…</option>
            {specialtyOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {specialtyOptions.length === 0 && (
            <span className="text-xs text-slate-500">
              Todas as especialidades já foram cadastradas para este plano.
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label>Valor (R$)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="120.00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Código (opcional)</Label>
          <Input
            type="text"
            placeholder="ex: 5012"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={specId === "" || value === ""}
          className="md:mb-0"
        >
          Adicionar
        </Button>
      </form>
    </div>
  );
}
