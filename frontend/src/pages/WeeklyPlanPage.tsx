import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Patient,
  type Specialty,
  type WeeklyPlanEntry,
} from "../api";
import { Button, Card, Label, Select } from "../components/Card";
import { WEEKDAYS } from "../utils";

type CellKey = string; // `${specialtyId}-${dow}`

function key(specialtyId: number, dow: number): CellKey {
  return `${specialtyId}-${dow}`;
}

export default function WeeklyPlanPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");
  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [includesSaturday, setIncludesSaturday] = useState<boolean>(false);

  // Matriz (specialty_id × day_of_week) -> sessões. Editado localmente até clicar em "Salvar".
  const [matrix, setMatrix] = useState<Record<CellKey, number>>({});

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

  async function loadEntries(pid: number) {
    const fresh = await api.get<WeeklyPlanEntry[]>(
      `/api/patients/${pid}/weekly-plan`,
    );
    setEntries(fresh);
    // Preenche a matriz a partir dos entries existentes
    const m: Record<CellKey, number> = {};
    for (const e of fresh) {
      m[key(e.specialty_id, e.day_of_week)] = e.sessions;
    }
    setMatrix(m);
  }

  useEffect(() => {
    if (patientId === "") {
      setEntries([]);
      setMatrix({});
      setIncludesSaturday(false);
      return;
    }
    const p = patients.find((x) => x.id === Number(patientId));
    setIncludesSaturday(!!p?.includes_saturday);
    loadEntries(Number(patientId)).catch((e) =>
      setError((e as Error).message),
    );
  }, [patientId, patients]);

  const dowCount = includesSaturday ? 6 : 5;

  async function toggleSaturday(next: boolean) {
    if (patientId === "") return;
    const prev = includesSaturday;
    setIncludesSaturday(next);
    try {
      const updated = await api.patch<Patient>(
        `/api/patients/${patientId}`,
        { includes_saturday: next ? 1 : 0 },
      );
      setPatients((list) =>
        list.map((x) => (x.id === updated.id ? updated : x)),
      );
      if (!next) {
        // se desligou sábado, remove células de sábado da matriz local
        setMatrix((m) => {
          const out: Record<CellKey, number> = {};
          for (const k of Object.keys(m)) {
            const dow = Number(k.split("-")[1]);
            if (dow !== 5) out[k] = m[k];
          }
          return out;
        });
      }
    } catch (e) {
      setIncludesSaturday(prev);
      setError((e as Error).message);
    }
  }

  const originalMatrix = useMemo(() => {
    const m: Record<CellKey, { id: number; sessions: number }> = {};
    for (const e of entries) {
      m[key(e.specialty_id, e.day_of_week)] = { id: e.id, sessions: e.sessions };
    }
    return m;
  }, [entries]);

  const isDirty = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(originalMatrix),
      ...Object.keys(matrix),
    ]);
    for (const k of allKeys) {
      const orig = originalMatrix[k]?.sessions ?? 0;
      const cur = matrix[k] ?? 0;
      if (orig !== cur) return true;
    }
    return false;
  }, [matrix, originalMatrix]);

  function setCell(specialtyId: number, dow: number, value: number) {
    const v = Math.max(0, Math.min(20, Math.floor(value || 0)));
    setMatrix((prev) => {
      const next = { ...prev };
      const k = key(specialtyId, dow);
      if (v === 0) delete next[k];
      else next[k] = v;
      return next;
    });
  }

  function fillRow(specialtyId: number, value: number) {
    setMatrix((prev) => {
      const next = { ...prev };
      for (let dow = 0; dow < dowCount; dow++) {
        const k = key(specialtyId, dow);
        if (value === 0) delete next[k];
        else next[k] = value;
      }
      return next;
    });
  }

  function clearAll() {
    if (!confirm("Limpar todas as células da matriz?")) return;
    setMatrix({});
  }

  async function save() {
    if (patientId === "") return;
    setSaving(true);
    setError(null);
    try {
      const allKeys = new Set([
        ...Object.keys(originalMatrix),
        ...Object.keys(matrix),
      ]);
      const ops: Promise<unknown>[] = [];
      for (const k of allKeys) {
        const orig = originalMatrix[k];
        const cur = matrix[k] ?? 0;
        const [spIdStr, dowStr] = k.split("-");
        const spId = Number(spIdStr);
        const dow = Number(dowStr);
        if (cur === 0 && orig) {
          ops.push(api.del(`/api/weekly-plan/${orig.id}`));
        } else if (cur > 0 && (!orig || orig.sessions !== cur)) {
          ops.push(
            api.post(`/api/patients/${patientId}/weekly-plan`, {
              day_of_week: dow,
              specialty_id: spId,
              sessions: cur,
            }),
          );
        }
      }
      await Promise.all(ops);
      await loadEntries(Number(patientId));
      const now = new Date();
      setSavedAt(
        `Salvo às ${now.getHours().toString().padStart(2, "0")}:${now
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    const m: Record<CellKey, number> = {};
    for (const e of entries) {
      m[key(e.specialty_id, e.day_of_week)] = e.sessions;
    }
    setMatrix(m);
  }

  const grouped = useMemo(() => {
    const g: Record<number, WeeklyPlanEntry[]> = {};
    for (const e of entries) {
      if (!g[e.day_of_week]) g[e.day_of_week] = [];
      g[e.day_of_week].push(e);
    }
    return g;
  }, [entries]);

  const sortedSpecialties = useMemo(
    () =>
      [...specialties].sort((a, b) => {
        const ao = a.display_order ?? 999;
        const bo = b.display_order ?? 999;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name, "pt-BR");
      }),
    [specialties],
  );

  const dayTotals = useMemo(() => {
    const t: Record<number, number> = {};
    for (let d = 0; d < dowCount; d++) {
      let sum = 0;
      for (const sp of sortedSpecialties) {
        sum += matrix[key(sp.id, d)] ?? 0;
      }
      t[d] = sum;
    }
    return t;
  }, [matrix, sortedSpecialties, dowCount]);

  const rowTotal = (specialtyId: number) => {
    let s = 0;
    for (let d = 0; d < dowCount; d++) s += matrix[key(specialtyId, d)] ?? 0;
    return s;
  };

  return (
    <div className="space-y-4">
      <Card
        title="Plano semanal de atendimentos"
        subtitle="Preencha rapidamente quantas sessões de cada especialidade o paciente realiza por dia. Use os atalhos para preencher a semana inteira."
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
          {patientId !== "" && (
            <div className="flex items-center gap-2">
              <input
                id="includes-saturday"
                type="checkbox"
                checked={includesSaturday}
                onChange={(e) => toggleSaturday(e.target.checked)}
                className="h-4 w-4"
              />
              <label
                htmlFor="includes-saturday"
                className="text-sm text-slate-700 select-none"
              >
                Atende aos sábados (semana seg–sáb)
              </label>
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

        {patientId !== "" && (
          <>
            {sortedSpecialties.length === 0 ? (
              <div className="text-sm text-slate-500">
                Cadastre especialidades antes de montar o plano semanal.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 w-56">Especialidade</th>
                        {WEEKDAYS.slice(0, dowCount).map((w, i) => (
                          <th
                            key={i}
                            className="px-2 py-2 text-center w-24 whitespace-nowrap"
                          >
                            {w}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center w-20">Semana</th>
                        <th className="px-2 py-2 text-center w-32">Atalhos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedSpecialties.map((sp) => {
                        const total = rowTotal(sp.id);
                        return (
                          <tr key={sp.id}>
                            <td className="px-3 py-1.5 font-medium">{sp.name}</td>
                            {Array.from({ length: dowCount }).map((_, dow) => {
                              const v = matrix[key(sp.id, dow)] ?? 0;
                              return (
                                <td key={dow} className="px-1 py-1 text-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={20}
                                    value={v}
                                    onChange={(e) =>
                                      setCell(sp.id, dow, Number(e.target.value))
                                    }
                                    onFocus={(e) => e.target.select()}
                                    className={`w-14 text-center rounded-md border px-1 py-1 ${
                                      v > 0
                                        ? "border-slate-400 bg-white font-semibold"
                                        : "border-slate-200 bg-slate-50 text-slate-400"
                                    }`}
                                  />
                                </td>
                              );
                            })}
                            <td className="px-2 py-1 text-center font-semibold">
                              {total}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <div className="flex flex-wrap justify-center gap-1">
                                {[1, 2].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => fillRow(sp.id, n)}
                                    className="text-xs rounded border border-slate-300 bg-white px-1.5 py-0.5 hover:bg-slate-100"
                                    title={`Preencher ${
                                      includesSaturday ? "seg–sáb" : "seg–sex"
                                    } com ${n}`}
                                  >
                                    {n}/dia
                                  </button>
                                ))}
                                {total > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => fillRow(sp.id, 0)}
                                    className="text-xs rounded border border-slate-300 bg-white px-1.5 py-0.5 hover:bg-slate-100 text-red-600"
                                    title="Zerar a linha"
                                  >
                                    zerar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td className="px-3 py-2 font-semibold">Total / dia</td>
                        {Array.from({ length: dowCount }).map((_, dow) => (
                          <td
                            key={dow}
                            className="px-2 py-2 text-center font-semibold"
                          >
                            {dayTotals[dow] ?? 0}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-semibold">
                          {Object.values(dayTotals).reduce((a, b) => a + b, 0)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <Button onClick={save} disabled={!isDirty || saving}>
                    {saving ? "Salvando…" : isDirty ? "Salvar plano" : "Salvo"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={discardChanges}
                    disabled={!isDirty || saving}
                  >
                    Descartar alterações
                  </Button>
                  <Button variant="secondary" onClick={clearAll} disabled={saving}>
                    Limpar tudo
                  </Button>
                  {savedAt && !isDirty && (
                    <span className="text-xs text-slate-500">{savedAt}</span>
                  )}
                  {isDirty && (
                    <span className="text-xs text-amber-600">
                      Há alterações não salvas
                    </span>
                  )}
                </div>

                <div className="mt-6">
                  <div className="text-sm font-medium text-slate-700 mb-2">
                    Visualização do plano salvo (por dia da semana)
                  </div>
                  <div
                    className={`grid grid-cols-1 gap-3 ${
                      includesSaturday ? "md:grid-cols-6" : "md:grid-cols-5"
                    }`}
                  >
                    {WEEKDAYS.slice(0, dowCount).map((w, i) => (
                      <div
                        key={i}
                        className="border border-slate-200 rounded-md p-3 bg-slate-50 min-h-24"
                      >
                        <div className="text-sm font-semibold text-slate-700 mb-2">
                          {w}
                        </div>
                        <ul className="space-y-1 text-sm">
                          {(grouped[i] ?? []).map((en) => (
                            <li
                              key={en.id}
                              className="bg-white border border-slate-200 rounded px-2 py-1"
                            >
                              <span className="font-medium">{en.sessions}x</span>{" "}
                              {en.specialty_name}
                            </li>
                          ))}
                          {(grouped[i] ?? []).length === 0 && (
                            <li className="text-xs text-slate-400">—</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
