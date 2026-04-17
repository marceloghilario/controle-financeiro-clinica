import { useEffect, useState } from "react";
import {
  api,
  type HealthPlan,
  type Specialty,
  type SpecialtyPrice,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { formatBRL } from "../utils";

export default function PricesPage() {
  const [plans, setPlans] = useState<HealthPlan[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [prices, setPrices] = useState<SpecialtyPrice[]>([]);
  const [planId, setPlanId] = useState<number | "">("");
  const [specId, setSpecId] = useState<number | "">("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    load().catch((e) => setError(e.message));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (planId === "" || specId === "" || value === "") return;
    try {
      await api.post("/api/specialty-prices", {
        health_plan_id: Number(planId),
        specialty_id: Number(specId),
        value: Number(value.replace(",", ".")),
      });
      setValue("");
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remover este preço?")) return;
    await api.del(`/api/specialty-prices/${id}`);
    await load();
  }

  return (
    <div className="space-y-4">
      <Card
        title="Preços por especialidade × plano de saúde"
        subtitle="Cada convênio pode pagar um valor diferente por especialidade. Use o mesmo valor caso queira preço único."
      >
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="flex flex-col gap-1">
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
          <div className="flex flex-col gap-1">
            <Label>Especialidade</Label>
            <Select
              value={specId}
              onChange={(e) => setSpecId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">Selecione…</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Valor por sessão (R$)</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="120.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full md:w-auto">
              Salvar
            </Button>
          </div>
        </form>
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Plano</th>
                <th className="text-left px-3 py-2">Especialidade</th>
                <th className="text-right px-3 py-2">Valor</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prices.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2">{p.health_plan_name}</td>
                  <td className="px-3 py-2">{p.specialty_name}</td>
                  <td className="px-3 py-2 text-right">{formatBRL(p.value)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" onClick={() => remove(p.id)}>
                      Remover
                    </Button>
                  </td>
                </tr>
              ))}
              {prices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                    Nenhum preço cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
