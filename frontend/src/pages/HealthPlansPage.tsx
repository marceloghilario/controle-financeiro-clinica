import { useEffect, useState } from "react";
import { api, type HealthPlan } from "../api";
import { Button, Card, Input } from "../components/Card";

export default function HealthPlansPage() {
  const [items, setItems] = useState<HealthPlan[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(await api.get<HealthPlan[]>("/api/health-plans"));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/api/health-plans", { name });
      setName("");
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remover este plano? Os pacientes vinculados precisarão ser ajustados.")) return;
    try {
      await api.del(`/api/health-plans/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card
      title="Planos de saúde"
      subtitle="Cadastre os convênios que atendem à clínica"
    >
      <form onSubmit={add} className="flex gap-2 mb-4">
        <Input
          placeholder="Nome do plano (ex: Unimed)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit">Adicionar</Button>
      </form>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <ul className="divide-y divide-slate-200">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between py-2">
            <span>{p.name}</span>
            <Button variant="ghost" onClick={() => remove(p.id)}>
              Remover
            </Button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-500 py-2">Nenhum plano cadastrado.</li>
        )}
      </ul>
    </Card>
  );
}
