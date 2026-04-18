import { useEffect, useMemo, useState } from "react";
import {
  api,
  type AbsenceDay,
  type Patient,
  type WeeklyPlanEntry,
} from "../api";
import { Card, Input, Label, Select } from "../components/Card";
import { MONTHS, WEEKDAYS, currentYearMonth } from "../utils";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function AbsencesPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");
  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([]);
  const [absences, setAbsences] = useState<AbsenceDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  const now = currentYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  useEffect(() => {
    api
      .get<Patient[]>("/api/patients")
      .then(setPatients)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (patientId === "") {
      setEntries([]);
      setAbsences([]);
      return;
    }
    Promise.all([
      api.get<WeeklyPlanEntry[]>(`/api/patients/${patientId}/weekly-plan`),
      api.get<AbsenceDay[]>(
        `/api/absence-days?patient_id=${patientId}&year=${year}&month=${month}`,
      ),
    ])
      .then(([e, a]) => {
        setEntries(e);
        setAbsences(a);
      })
      .catch((err) => setError((err as Error).message));
  }, [patientId, year, month]);

  // Mapa dia_da_semana -> lista de especialidades do plano
  const planByWeekday = useMemo(() => {
    const m: Record<number, string[]> = {};
    for (const e of entries) {
      if (!m[e.day_of_week]) m[e.day_of_week] = [];
      if (e.specialty_name) m[e.day_of_week].push(e.specialty_name);
    }
    for (const k of Object.keys(m)) {
      m[Number(k)] = Array.from(new Set(m[Number(k)])).sort();
    }
    return m;
  }, [entries]);

  const absenceByDate = useMemo(() => {
    const m = new Map<string, AbsenceDay>();
    for (const a of absences) m.set(a.date, a);
    return m;
  }, [absences]);

  async function toggleDate(dateStr: string) {
    if (patientId === "") return;
    try {
      const existing = absenceByDate.get(dateStr);
      if (existing) {
        await api.del(`/api/absence-days/${existing.id}`);
      } else {
        await api.post<AbsenceDay>("/api/absence-days", {
          patient_id: Number(patientId),
          date: dateStr,
          note: null,
        });
      }
      const fresh = await api.get<AbsenceDay[]>(
        `/api/absence-days?patient_id=${patientId}&year=${year}&month=${month}`,
      );
      setAbsences(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Gera lista de dias do mês (seg–sex)
  const businessDays = useMemo(() => {
    if (patientId === "") return [];
    const total = daysInMonth(year, month);
    const out: { day: number; dow: number; dateStr: string }[] = [];
    for (let d = 1; d <= total; d++) {
      const js = new Date(year, month - 1, d);
      // JS: 0=Dom, 1=Seg...6=Sáb. Convert to 0=Seg..6=Dom
      const jsDow = js.getDay();
      const dow = (jsDow + 6) % 7;
      if (dow < 5) {
        out.push({ day: d, dow, dateStr: `${year}-${pad2(month)}-${pad2(d)}` });
      }
    }
    return out;
  }, [patientId, year, month]);

  return (
    <Card
      title="Faltas por dia"
      subtitle="Marque os dias em que o paciente faltou. O sistema identifica automaticamente as terapias impactadas com base no plano semanal."
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="flex flex-col gap-1 md:col-span-2">
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
        <div className="flex flex-col gap-1">
          <Label>Mês</Label>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Ano</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
      </div>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

      {patientId === "" ? (
        <div className="text-sm text-slate-500">
          Selecione um paciente para marcar faltas.
        </div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-slate-500">
          Este paciente ainda não tem plano semanal. Cadastre o plano antes de registrar
          faltas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {businessDays.map(({ day, dow, dateStr }) => {
              const planned = planByWeekday[dow] ?? [];
              const isAbsent = absenceByDate.has(dateStr);
              const hasPlan = planned.length > 0;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => toggleDate(dateStr)}
                  disabled={!hasPlan}
                  className={`text-left border rounded-lg p-3 transition ${
                    isAbsent
                      ? "bg-red-50 border-red-400 ring-2 ring-red-200"
                      : hasPlan
                        ? "bg-white border-slate-200 hover:border-slate-400"
                        : "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">
                      {pad2(day)}/{pad2(month)}
                    </span>
                    <span className="text-xs text-slate-500">{WEEKDAYS[dow]}</span>
                  </div>
                  {hasPlan ? (
                    <div
                      className={`text-xs mt-1 ${
                        isAbsent ? "text-red-700" : "text-slate-600"
                      }`}
                    >
                      {isAbsent ? "FALTOU · " : ""}
                      {planned.join(", ")}
                    </div>
                  ) : (
                    <div className="text-xs mt-1 text-slate-400">sem atendimento</div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Clique em um dia útil para marcar/desmarcar como falta. Dias sem atendimento
            no plano semanal ficam desabilitados.
          </div>
        </>
      )}
    </Card>
  );
}
