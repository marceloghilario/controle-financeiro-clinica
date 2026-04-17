"""Regras de cálculo financeiro mensal por paciente."""

from __future__ import annotations

import calendar

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
    bdays = business_days_by_weekday(year, month)

    # Agrupa sessões planejadas por especialidade (somando os dias da semana).
    planned_by_specialty: dict[int, int] = {}
    for entry in patient.weekly_entries:
        if entry.day_of_week not in bdays:
            continue
        # Só conta dias úteis. Se o plano semanal tiver sábado/domingo, ignora.
        if entry.day_of_week >= 5:
            continue
        planned_by_specialty.setdefault(entry.specialty_id, 0)
        planned_by_specialty[entry.specialty_id] += entry.sessions * bdays[entry.day_of_week]

    # Mapa de faltas do paciente no mês.
    absences = {
        a.specialty_id: a.count
        for a in patient.absences
        if a.year == year and a.month == month
    }

    # Mapa de preços (especialidade -> valor) para o plano do paciente.
    prices = {
        p.specialty_id: p.value
        for p in patient.health_plan.prices
    }

    items: list[schemas.SpecialtyReportItem] = []
    total = 0.0
    for specialty_id, planned in planned_by_specialty.items():
        absent = absences.get(specialty_id, 0)
        billed = max(0, planned - absent)
        unit = prices.get(specialty_id, 0.0)
        subtotal = billed * unit
        total += subtotal
        # Pega nome da especialidade via relationship.
        specialty = db.get(models.Specialty, specialty_id)
        items.append(
            schemas.SpecialtyReportItem(
                specialty_id=specialty_id,
                specialty_name=specialty.name if specialty else "?",
                sessions_planned=planned,
                absences=absent,
                sessions_billed=billed,
                unit_value=unit,
                total=round(subtotal, 2),
            )
        )

    items.sort(key=lambda i: i.specialty_name)

    return schemas.PatientMonthReport(
        patient_id=patient.id,
        patient_name=patient.name,
        health_plan_id=patient.health_plan_id,
        health_plan_name=patient.health_plan.name,
        year=year,
        month=month,
        business_days_by_weekday=bdays,
        items=items,
        total=round(total, 2),
    )
