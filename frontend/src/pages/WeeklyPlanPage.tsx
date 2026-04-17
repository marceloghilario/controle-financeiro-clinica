import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Patient,
  type Specialty,
  type WeeklyPlanEntry,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { WEEKDAYS } from "../utils";

export default function WeeklyPlanPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");
  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [specId, setSpecId] = useState<number | "">("");
  const [sessions, setSessions] = useState<number>(1);

  useEffect(() => {
    Promise.all([
      api.get<Patient[]>("/api/patients"),
      api.get<Specialty[]>("/api/specialties"),
    ])
      .then(([p, s]) => {
        setPatients(p);
        setSpecialties(s);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (patientId === "") {
      setEntries([]);
      return;
    }
    api
      .get<WeeklyPlanEntry[]>(`/api/patients/${patientId}/weekly-plan`)
      .then(setEntries)
      .catch((e) => setError((e as Error).message));
  }, [patientId]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (patientId === "" || specId === "" || !sessions) return;
    try {
      await api.post(`/api/patients/${patientId}/weekly-plan`, {
        day_of_week: Number(dayOfWeek),
        specialty_id: Number(specId),
        sessions: Number(sessions),
      });
      setSpecId("");
      setSessions(1);
      setError(null);
      const fresh = await api.get<WeeklyPlanEntry[]>(
        `/api/patients/${patientId}/weekly-plan`,
      );
      setEntries(fresh);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm("Remover esta entrada?")) return;
    await api.del(`/api/weekly-plan/${id}`);
    const fresh = await api.get<WeeklyPlanEntry[]>(
      `/api/patients/${patientId}/weekly-plan`,
    );
    setEntries(fresh);
  }

  const grouped = useMemo(() => {
    const g: Record<number, WeeklyPlanEntry[]> = {};
    for (const e of entries) {
      if (!g[e.day_of_week]) g[e.day_of_week] = [];
      g[e.day_of_week].push(e);
    }
    return g;
  }, [entries]);

  return (
    <div className="space-y-4">
      <Card
        title="Plano semanal de atendimentos"
        subtitle="Defina, por dia da semana, quantas sessões de cada especialidade o paciente realiza."
      >
        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
          <div className="flex flex-col gap-1 md:w-96">
            <Label>Paciente</Label>
            <Select
              value={patientId}
              onChange={(e) =>
                setPatientId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">Selecione…</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.health_plan_name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {patientId !== "" && (
          <>
            <form
              onSubmit={addEntry}
              className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-5 border-t border-slate-200 pt-4"
            >
              <div className="flex flex-col gap-1">
                <Label>Dia da semana</Label>
                <Select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                >
                  {WEEKDAYS.slice(0, 5).map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <Label>Especialidade</Label>
                <Select
                  value={specId}
                  onChange={(e) =>
                    setSpecId(e.target.value === "" ? "" : Number(e.target.value))
                  }
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
                <Label>Nº de sessões</Label>
                <Input
                  type="number"
                  min={1}
                  value={sessions}
                  onChange={(e) => setSessions(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  Adicionar ao plano
                </Button>
              </div>
            </form>
            {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {WEEKDAYS.slice(0, 5).map((w, i) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-md p-3 bg-slate-50 min-h-32"
                >
                  <div className="text-sm font-semibold text-slate-700 mb-2">{w}</div>
                  <ul className="space-y-1 text-sm">
                    {(grouped[i] ?? []).map((en) => (
                      <li
                        key={en.id}
                        className="flex items-center justify-between bg-white border border-slate-200 rounded px-2 py-1"
                      >
                        <span>
                          <span className="font-medium">{en.sessions}x</span>{" "}
                          {en.specialty_name}
                        </span>
                        <button
                          onClick={() => remove(en.id)}
                          className="text-slate-400 hover:text-red-600"
                          title="Remover"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                    {(grouped[i] ?? []).length === 0 && (
                      <li className="text-xs text-slate-400">—</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
