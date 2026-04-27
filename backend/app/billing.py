"""Regras de cálculo financeiro mensal por paciente."""

from __future__ import annotations

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas


def _holiday_dates_for_month(db: Session, year: int, month: int) -> set[date]:
    rows = db.scalars(select(models.Holiday)).all()
    return {h.date for h in rows if h.date.year == year and h.date.month == month}


def business_days_by_weekday(
    year: int, month: int, holiday_dates: set[date] | None = None
) -> dict[int, int]:
    """Retorna {dia_da_semana: quantidade_no_mes} contando dias úteis (seg–sex),
    excluindo feriados informados.
    """
    holiday_dates = holiday_dates or set()
    _, last_day = calendar.monthrange(year, month)
    counts: dict[int, int] = {i: 0 for i in range(7)}
    for day in range(1, last_day + 1):
        d = date(year, month, day)
        dow = calendar.weekday(year, month, day)
        if dow < 5 and d not in holiday_dates:  # seg–sex e não feriado
            counts[dow] += 1
    return counts


def compute_patient_month(
    db: Session, patient: models.Patient, year: int, month: int
) -> schemas.PatientMonthReport:
    """Calcula o faturamento do paciente no mês, descontando feriados globais."""
    holiday_dates = _holiday_dates_for_month(db, year, month)
    bdays = business_days_by_weekday(year, month, holiday_dates)
    _, last_day = calendar.monthrange(year, month)

    # dia_da_semana -> lista de (specialty_id, sessions)
    by_weekday: dict[int, list[tuple[int, int]]] = {i: [] for i in range(7)}
    for entry in patient.weekly_entries:
        if entry.day_of_week < 5:
            by_weekday[entry.day_of_week].append((entry.specialty_id, entry.sessions))

    absence_dates: set[date] = {
        a.date for a in patient.absence_days if a.date.year == year and a.date.month == month
    }

    planned: dict[int, int] = {}
    absences: dict[int, int] = {}
    billed: dict[int, int] = {}

    for day in range(1, last_day + 1):
        dow = calendar.weekday(year, month, day)
        if dow >= 5:
            continue
        d = date(year, month, day)
        if d in holiday_dates:
            # feriado: nem previsto, nem faltado, nem faturado
            continue
        entries = by_weekday.get(dow, [])
        is_absent = d in absence_dates
        for specialty_id, sessions in entries:
            planned[specialty_id] = planned.get(specialty_id, 0) + sessions
            if is_absent:
                absences[specialty_id] = absences.get(specialty_id, 0) + sessions
            else:
                billed[specialty_id] = billed.get(specialty_id, 0) + sessions

    prices = {p.specialty_id: p.value for p in patient.health_plan.prices}

    items: list[schemas.SpecialtyReportItem] = []
    item_order: dict[int, tuple[int, str]] = {}
    total = 0.0
    for specialty_id, planned_count in planned.items():
        absent = absences.get(specialty_id, 0)
        billed_count = billed.get(specialty_id, 0)
        unit = prices.get(specialty_id, 0.0)
        subtotal = billed_count * unit
        total += subtotal
        specialty = db.get(models.Specialty, specialty_id)
        order_key = (
            specialty.display_order if specialty is not None else 999,
            specialty.name if specialty is not None else "?",
        )
        item_order[specialty_id] = order_key
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
    items.sort(key=lambda i: item_order.get(i.specialty_id, (999, i.specialty_name)))

    absence_details: list[schemas.AbsenceDetail] = []
    for a in sorted(patient.absence_days, key=lambda a: a.date):
        if a.date.year != year or a.date.month != month:
            continue
        dow = a.date.weekday()
        impacted_specs: list[models.Specialty] = []
        for sp_id, _ in by_weekday.get(dow, []):
            sp = db.get(models.Specialty, sp_id)
            if sp is not None:
                impacted_specs.append(sp)
        impacted_specs.sort(key=lambda s: (s.display_order, s.name))
        absence_details.append(
            schemas.AbsenceDetail(
                date=a.date,
                day_of_week=dow,
                impacted_specialties=[s.name for s in impacted_specs],
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
