import { useCallback, useEffect, useState } from "react";
import { api, type HealthPlan, type Patient } from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { formatCPF, isValidCPF, maskCPF, onlyDigits } from "../utils";

export default function PatientsPage() {
  const [items, setItems] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [planId, setPlanId] = useState<number | "">("");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterName, setFilterName] = useState("");
  const [filterInsurance, setFilterInsurance] = useState("");
  const [insurances, setInsurances] = useState<string[]>([]);

  const hasActiveFilter = filterName.trim() !== "" || filterInsurance !== "";

  const loadPatients = useCallback(async (nome: string, convenio: string) => {
    const params = new URLSearchParams();
    if (nome.trim()) params.set("nome", nome.trim());
    if (convenio) params.set("convenio", convenio);
    const qs = params.toString();
    const p = await api.get<Patient[]>(`/api/patients${qs ? `?${qs}` : ""}`);
    setItems(p);
  }, []);

  const load = useCallback(async () => {
    const [pl, ins] = await Promise.all([
      api.get<HealthPlan[]>("/api/health-plans"),
      api.get<string[]>("/api/patients/insurances"),
    ]);
    setPlans(pl);
    setInsurances(ins);
    await loadPatients(filterName, filterInsurance);
  }, [filterInsurance, filterName, loadPatients]);

  useEffect(() => {
    api
      .get<HealthPlan[]>("/api/health-plans")
      .then(setPlans)
      .catch((e) => setError(e.message));
    api
      .get<string[]>("/api/patients/insurances")
      .then(setInsurances)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadPatients(filterName, filterInsurance).catch((e) =>
        setError((e as Error).message),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [filterName, filterInsurance, loadPatients]);

  function resetForm() {
    setName("");
    setCpf("");
    setBeneficiary("");
    setPlanId("");
    setEditing(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || planId === "") return;
    const cpfDigits = onlyDigits(cpf);
    if (cpfDigits && !isValidCPF(cpfDigits)) {
      setError("CPF inválido. Verifique os dígitos.");
      return;
    }
    try {
      const payload = {
        name,
        cpf: cpfDigits ? maskCPF(cpfDigits) : null,
        beneficiary: beneficiary.trim() || null,
        health_plan_id: Number(planId),
      };
      if (editing) {
        await api.put(`/api/patients/${editing.id}`, payload);
      } else {
        await api.post("/api/patients", { ...payload, active: 1 });
      }
      resetForm();
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(p: Patient) {
    setEditing(p);
    setName(p.name);
    setCpf(p.cpf ? maskCPF(p.cpf) : "");
    setBeneficiary(p.beneficiary ?? "");
    setPlanId(p.health_plan_id);
  }

  async function remove(id: number) {
    if (!confirm("Remover este paciente e seu plano semanal?")) return;
    try {
      await api.del(`/api/patients/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card
      title="Pacientes"
      subtitle={
        hasActiveFilter
          ? `${items.length} paciente(s) no filtro atual`
          : `${items.length} paciente(s) cadastrado(s)`
      }
    >
      <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label>Nome do paciente</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>CPF</Label>
          <Input
            value={cpf}
            onChange={(e) => setCpf(maskCPF(e.target.value))}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
          />
          {cpf && onlyDigits(cpf).length === 11 && !isValidCPF(cpf) && (
            <span className="text-xs text-red-600">CPF inválido</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label>Código do beneficiário</Label>
          <Input
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            placeholder="Identificação do paciente no plano de saúde"
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label>Plano de saúde</Label>
          <Select
            value={planId}
            onChange={(e) => setPlanId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Selecione…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <Button type="submit" className="flex-1">
            {editing ? "Salvar alterações" : "Adicionar"}
          </Button>
          {editing && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </form>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label>Filtrar por nome</Label>
          <Input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Digite parte do nome"
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label>Filtrar por convênio</Label>
          <Select
            value={filterInsurance}
            onChange={(e) => setFilterInsurance(e.target.value)}
          >
            <option value="">Todos</option>
            {insurances.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Paciente</th>
              <th className="text-left px-3 py-2">CPF</th>
              <th className="text-left px-3 py-2">Cód. beneficiário</th>
              <th className="text-left px-3 py-2">Plano</th>
              <th className="text-right px-3 py-2 w-40" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-slate-600">{formatCPF(p.cpf) || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{p.beneficiary || "—"}</td>
                <td className="px-3 py-2">{p.health_plan_name}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button variant="secondary" onClick={() => startEdit(p)}>
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => remove(p.id)}>
                    Remover
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                  {hasActiveFilter
                    ? "Nenhum paciente encontrado para os filtros informados."
                    : "Nenhum paciente cadastrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
