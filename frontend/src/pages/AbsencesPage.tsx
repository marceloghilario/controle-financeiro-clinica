import { useEffect, useMemo, useState } from "react";
import {
  api,
  type MonthlyAbsence,
  type Patient,
  type WeeklyPlanEntry,
} from "../api";
import { Card, Input, Label, Select } from "../components/Card";
import { MONTHS, currentYearMonth } from "../utils";

export default function AbsencesPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");
  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([]);
  const [absences, setAbsences] = useState<MonthlyAbsence[]>([]);
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
      api.get<MonthlyAbsence[]>(
        `/api/absences?year=${year}&month=${month}&patient_id=${patientId}`,
      ),
    ])
      .then(([e, a]) => {
        setEntries(e);
        setAbsences(a);
      })
      .catch((err) => setError((err as Error).message));
  }, [patientId, year, month]);

  const specialtiesInPlan = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of entries) {
      if (e.specialty_name) m.set(e.specialty_id, e.specialty_name);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [entries]);

  async function setAbsenceCount(specialtyId: number, count: number) {
    if (patientId === "") return;
    try {
      await api.post<MonthlyAbsence>("/api/absences", {
        patient_id: Number(patientId),
        specialty_id: specialtyId,
        year,
        month,
        count,
      });
      const fresh = await api.get<MonthlyAbsence[]>(
        `/api/absences?year=${year}&month=${month}&patient_id=${patientId}`,
      );
      setAbsences(fresh);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card
      title="Faltas do mês"
      subtitle="Registre quantas sessões o paciente faltou no mês (as faltas são descontadas do total a faturar)."
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

      {patientId !== "" && (
        <>
          {specialtiesInPlan.length === 0 ? (
            <div className="text-sm text-slate-500">
              Este paciente ainda não tem plano semanal. Cadastre o plano antes de registrar
              faltas.
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2">Especialidade</th>
                  <th className="text-right px-3 py-2 w-40">Faltas no mês</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {specialtiesInPlan.map((s) => {
                  const current = absences.find((a) => a.specialty_id === s.id)?.count ?? 0;
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 text-right">
                        <AbsenceInput
                          value={current}
                          onChange={(v) => setAbsenceCount(s.id, v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  );
}

function AbsenceInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <Input
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Math.max(0, Number(draft) || 0);
        if (n !== value) onChange(n);
      }}
      className="w-24 text-right"
    />
  );
}
