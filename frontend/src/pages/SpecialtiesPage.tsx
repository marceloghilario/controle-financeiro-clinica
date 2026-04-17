import { useEffect, useState } from "react";
import { api, type Specialty } from "../api";
import { Button, Card, Input } from "../components/Card";

export default function SpecialtiesPage() {
  const [items, setItems] = useState<Specialty[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(await api.get<Specialty[]>("/api/specialties"));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/api/specialties", { name });
      setName("");
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remover esta especialidade?")) return;
    try {
      await api.del(`/api/specialties/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card
      title="Especialidades"
      subtitle="Ex: Fisioterapia, Fonoaudiologia, Psicologia, Nutrição, Terapia Ocupacional"
    >
      <form onSubmit={add} className="flex gap-2 mb-4">
        <Input
          placeholder="Nome da especialidade"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit">Adicionar</Button>
      </form>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      <ul className="divide-y divide-slate-200">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2">
            <span>{s.name}</span>
            <Button variant="ghost" onClick={() => remove(s.id)}>
              Remover
            </Button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-500 py-2">Nenhuma especialidade cadastrada.</li>
        )}
      </ul>
    </Card>
  );
}
