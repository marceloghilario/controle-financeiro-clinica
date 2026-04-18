import { useEffect, useState } from "react";
import { api, type HealthPlan, type Patient } from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";

export default function PatientsPage() {
  const [items, setItems] = useState<Patient[]>([]);
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [planId, setPlanId] = useState<number | "">("");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [p, pl] = await Promise.all([
      api.get<Patient[]>("/api/patients"),
      api.get<HealthPlan[]>("/api/health-plans"),
    ]);
    setItems(p);
    setPlans(pl);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
    try {
      const payload = {
        name,
        cpf: cpf.trim() || null,
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
    setCpf(p.cpf ?? "");
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
      subtitle="Cadastro de pacientes e vínculo com plano de saúde"
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
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Beneficiário</Label>
          <Input
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            placeholder="Nome do titular / beneficiário do plano"
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
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Paciente</th>
              <th className="text-left px-3 py-2">CPF</th>
              <th className="text-left px-3 py-2">Beneficiário</th>
              <th className="text-left px-3 py-2">Plano</th>
              <th className="text-right px-3 py-2 w-40" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-slate-600">{p.cpf || "—"}</td>
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
                  Nenhum paciente cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
