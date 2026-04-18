"""Regras de cálculo financeiro mensal por paciente."""

from __future__ import annotations

import calendar
from datetime import date

from sqlalchemy.orm import Session

from . import models, schemas


def business_days_by_weekday(year: int, month: int) -> dict[int, int]:
    """Retorna um dict {dia_da_semana: quantidade_no_mes} contando apenas dias úteis (seg–sex).

    day_of_week segue o padrão do Python: 0=Segunda, 1=Terça, ..., 4=Sexta, 5=Sábado, 6=Domingo.
    """
    _, last_day = calendar.monthrange(year, month)
    counts: dict[int, int] = {i: 0 for i in range(7)}
    for day in range(1, last_day + 1):
        dow = calendar.weekday(year, month, day)
        if dow < 5:  # seg–sex
            counts[dow] += 1
    return counts


def compute_patient_month(
    db: Session, patient: models.Patient, year: int, month: int
) -> schemas.PatientMonthReport:
    """Calcula o faturamento do paciente no mês.

    A regra é: para cada dia útil do mês, somamos as sessões do plano semanal daquele
    dia da semana. Se o paciente faltou naquele dia (AbsenceDay), as sessões daquele
    dia inteiro entram como "faltas" (descontadas do total a faturar).
    """
    bdays = business_days_by_weekday(year, month)
    _, last_day = calendar.monthrange(year, month)

    # Monta um índice: dia_da_semana -> lista de (specialty_id, sessions)
    by_weekday: dict[int, list[tuple[int, int]]] = {i: [] for i in range(7)}
    for entry in patient.weekly_entries:
        if entry.day_of_week < 5:  # só seg-sex
            by_weekday[entry.day_of_week].append((entry.specialty_id, entry.sessions))

    # Datas em que o paciente faltou neste mês
    absence_dates: set[date] = {
        a.date for a in patient.absence_days if a.date.year == year and a.date.month == month
    }

    # Acumuladores por especialidade
    planned: dict[int, int] = {}
    absences: dict[int, int] = {}
    billed: dict[int, int] = {}

    for day in range(1, last_day + 1):
        dow = calendar.weekday(year, month, day)
        if dow >= 5:
            continue
        entries = by_weekday.get(dow, [])
        d = date(year, month, day)
        is_absent = d in absence_dates
        for specialty_id, sessions in entries:
            planned[specialty_id] = planned.get(specialty_id, 0) + sessions
            if is_absent:
                absences[specialty_id] = absences.get(specialty_id, 0) + sessions
            else:
                billed[specialty_id] = billed.get(specialty_id, 0) + sessions

    # Mapa de preços (especialidade -> valor) para o plano do paciente
    prices = {p.specialty_id: p.value for p in patient.health_plan.prices}

    items: list[schemas.SpecialtyReportItem] = []
    total = 0.0
    for specialty_id, planned_count in planned.items():
        absent = absences.get(specialty_id, 0)
        billed_count = billed.get(specialty_id, 0)
        unit = prices.get(specialty_id, 0.0)
        subtotal = billed_count * unit
        total += subtotal
        specialty = db.get(models.Specialty, specialty_id)
        items.append(
            schemas.SpecialtyReportItem(
                specialty_id=specialty_id,
                specialty_name=specialty.name if specialty else "?",
                sessions_planned=planned_count,
                absences=absent,
                sessions_billed=billed_count,
                unit_value=unit,
                total=round(subtotal, 2),
            )
        )
    items.sort(key=lambda i: i.specialty_name)

    # Detalhe das datas de falta (para exibir no relatório)
    absence_details: list[schemas.AbsenceDetail] = []
    for a in sorted(patient.absence_days, key=lambda a: a.date):
        if a.date.year != year or a.date.month != month:
            continue
        dow = a.date.weekday()
        impacted = [
            db.get(models.Specialty, sp_id).name
            for sp_id, _ in by_weekday.get(dow, [])
            if db.get(models.Specialty, sp_id) is not None
        ]
        absence_details.append(
            schemas.AbsenceDetail(
                date=a.date,
                day_of_week=dow,
                impacted_specialties=sorted(impacted),
            )
        )

    return schemas.PatientMonthReport(
        patient_id=patient.id,
        patient_name=patient.name,
        patient_cpf=patient.cpf,
        patient_beneficiary=patient.beneficiary,
        health_plan_id=patient.health_plan_id,
        health_plan_name=patient.health_plan.name,
        year=year,
        month=month,
        business_days_by_weekday=bdays,
        items=items,
        absence_days=absence_details,
        total=round(total, 2),
    )
