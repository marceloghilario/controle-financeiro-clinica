import { useEffect, useMemo, useState } from "react";
import {
  api,
  type AbsenceDay,
  type Holiday,
  type Patient,
  type PatientMonthReport,
  type WeeklyPlanEntry,
} from "../api";
import { Button, Card, Input, Label, Select } from "../components/Card";
import { MONTHS, WEEKDAYS, currentYearMonth, formatIsoDate } from "../utils";
import { PatientReportCard } from "./ReportsPage";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function SessionsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState<number | "">("");

  const now = currentYearMonth();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);

  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([]);
  const [absences, setAbsences] = useState<AbsenceDay[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [report, setReport] = useState<PatientMonthReport | null>(null);

  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDesc, setHolidayDesc] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);

  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Patient[]>("/api/patients")
      .then(setPatients)
      .catch((e) => setError((e as Error).message));
  }, []);

  async function loadHolidays() {
    try {
      const list = await api.get<Holiday[]>(
        `/api/holidays?year=${year}&month=${month}`,
      );
      setHolidays(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadReport() {
    if (patientId === "") {
      setReport(null);
      return;
    }
    setReportLoading(true);
    try {
      const r = await api.get<PatientMonthReport>(
        `/api/reports/patient/${patientId}?year=${year}&month=${month}`,
      );
      setReport(r);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReportLoading(false);
    }
  }

  // Carrega holidays do mês sempre que mês/ano mudam
  useEffect(() => {
    loadHolidays();
  }, [year, month]);

  // Carrega plano semanal + faltas do paciente
  useEffect(() => {
    if (patientId === "") {
      setEntries([]);
      setAbsences([]);
      setReport(null);
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
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, year, month]);

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

  const holidayByDate = useMemo(() => {
    const m = new Map<string, Holiday>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  const businessDays = useMemo(() => {
    const total = daysInMonth(year, month);
    const out: { day: number; dow: number; dateStr: string }[] = [];
    for (let d = 1; d <= total; d++) {
      const js = new Date(year, month - 1, d);
      const jsDow = js.getDay();
      const dow = (jsDow + 6) % 7;
      if (dow < 5) {
        out.push({ day: d, dow, dateStr: `${year}-${pad2(month)}-${pad2(d)}` });
      }
    }
    return out;
  }, [year, month]);

  async function toggleAbsence(dateStr: string) {
    if (patientId === "") return;
    if (holidayByDate.has(dateStr)) return; // feriado não vira falta
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
      loadReport();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault();
    if (!holidayDate) return;
    setHolidaySaving(true);
    try {
      await api.post<Holiday>("/api/holidays", {
        date: holidayDate,
        description: holidayDesc.trim() || null,
      });
      setHolidayDate("");
      setHolidayDesc("");
      await loadHolidays();
      loadReport();
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHolidaySaving(false);
    }
  }

  async function removeHoliday(id: number) {
    try {
      await api.del(`/api/holidays/${id}`);
      await loadHolidays();
      loadReport();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function quickAddHoliday(dateStr: string) {
    setHolidayDate(dateStr);
    setHolidayDesc("");
    setTimeout(() => {
      const el = document.getElementById("holiday-form");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  return (
    <div className="space-y-4">
      <Card
        title="Sessão"
        subtitle="Selecione o paciente e o mês para registrar faltas, feriados e ver o relatório do período."
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
        {error && <div className="text-sm text-red-600 mt-3">{error}</div>}
      </Card>

      <Card
        title={`Feriados · ${MONTHS[month - 1]}/${year}`}
        subtitle="Feriados são globais (válidos para todos os pacientes) e ficam fora do cálculo de dias úteis."
      >
        <form
          id="holiday-form"
          onSubmit={addHoliday}
          className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4"
        >
          <div className="flex flex-col gap-1">
            <Label>Data do feriado</Label>
            <Input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label>Descrição (opcional)</Label>
            <Input
              value={holidayDesc}
              onChange={(e) => setHolidayDesc(e.target.value)}
              placeholder="Ex: Tiradentes"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={holidaySaving || !holidayDate}>
              {holidaySaving ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </form>

        {holidays.length === 0 ? (
          <div className="text-sm text-slate-500">
            Nenhum feriado cadastrado para {MONTHS[month - 1]}/{year}.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-mono mr-2">{formatIsoDate(h.date)}</span>
                  <span className="text-slate-600">{h.description || "—"}</span>
                </div>
                <Button variant="secondary" onClick={() => removeHoliday(h.id)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {patientId !== "" && (
        <Card
          title="Faltas do paciente"
          subtitle="Clique em um dia útil para marcar/desmarcar como falta. Feriados e dias sem atendimento ficam desabilitados."
        >
          {entries.length === 0 ? (
            <div className="text-sm text-slate-500">
              Este paciente ainda não tem plano semanal. Cadastre o plano antes de
              registrar faltas.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {businessDays.map(({ day, dow, dateStr }) => {
                const planned = planByWeekday[dow] ?? [];
                const isAbsent = absenceByDate.has(dateStr);
                const holiday = holidayByDate.get(dateStr);
                const hasPlan = planned.length > 0;
                const isHoliday = !!holiday;
                return (
                  <div
                    key={dateStr}
                    className={`text-left border rounded-lg p-3 transition ${
                      isHoliday
                        ? "bg-amber-50 border-amber-300"
                        : isAbsent
                          ? "bg-red-50 border-red-400 ring-2 ring-red-200"
                          : hasPlan
                            ? "bg-white border-slate-200 hover:border-slate-400"
                            : "bg-slate-50 border-slate-200 opacity-60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleAbsence(dateStr)}
                      disabled={!hasPlan || isHoliday}
                      className="w-full text-left disabled:cursor-not-allowed"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold">
                          {pad2(day)}/{pad2(month)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {WEEKDAYS[dow]}
                        </span>
                      </div>
                      {isHoliday ? (
                        <div className="text-xs mt-1 text-amber-700">
                          FERIADO{holiday.description ? ` · ${holiday.description}` : ""}
                        </div>
                      ) : hasPlan ? (
                        <div
                          className={`text-xs mt-1 ${
                            isAbsent ? "text-red-700" : "text-slate-600"
                          }`}
                        >
                          {isAbsent ? "FALTOU · " : ""}
                          {planned.join(", ")}
                        </div>
                      ) : (
                        <div className="text-xs mt-1 text-slate-400">
                          sem atendimento
                        </div>
                      )}
                    </button>
                    {!isHoliday && (
                      <button
                        type="button"
                        onClick={() => quickAddHoliday(dateStr)}
                        className="text-[11px] text-slate-500 hover:text-amber-700 mt-1"
                      >
                        + marcar feriado
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {patientId !== "" && (
        <>
          {reportLoading && (
            <Card title="Relatório do paciente">
              <div className="text-sm text-slate-500">Atualizando relatório…</div>
            </Card>
          )}
          {report && !reportLoading && <PatientReportCard report={report} />}
        </>
      )}
    </div>
  );
}
