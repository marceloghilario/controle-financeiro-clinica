import { useEffect, useState } from "react";
import { api, type Specialty } from "../api";
import { Button, Card, Input } from "../components/Card";

export default function SpecialtiesPage() {
  const [items, setItems] = useState<Specialty[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

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

  function startEdit(s: Specialty) {
    setEditingId(s.id);
    setEditName(s.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    try {
      await api.put(`/api/specialties/${id}`, { name: editName });
      setEditingId(null);
      setEditName("");
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

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setItems(reordered);
    try {
      await api.post("/api/specialties/reorder", {
        ids: reordered.map((s) => s.id),
      });
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    }
  }

  return (
    <Card
      title="Especialidades"
      subtitle="A ordem abaixo é a ordem de exibição nas demais telas (Preços, Plano semanal, Sessões, Notas)."
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
        {items.map((s, idx) => (
          <li key={s.id} className="flex items-center justify-between gap-2 py-2">
            {editingId === s.id ? (
              <>
                <span className="w-6 text-xs text-slate-400 tabular-nums">
                  {idx + 1}.
                </span>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit(s.id);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                />
                <Button onClick={() => saveEdit(s.id)}>Salvar</Button>
                <Button variant="ghost" onClick={cancelEdit}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="w-6 text-xs text-slate-400 tabular-nums">
                  {idx + 1}.
                </span>
                <span className="flex-1">{s.name}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    title="Mover para cima"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1}
                    title="Mover para baixo"
                  >
                    ↓
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => startEdit(s)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => remove(s.id)}>
                  Remover
                </Button>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-500 py-2">Nenhuma especialidade cadastrada.</li>
        )}
      </ul>
      <p className="mt-4 text-xs text-slate-500">
        Use ↑/↓ para reordenar. A ordem é aplicada automaticamente em Preços,
        Plano semanal, Sessões, Relatórios e Notas fiscais.
      </p>
    </Card>
  );
}
