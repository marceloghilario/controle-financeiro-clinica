from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import billing, models, schemas
from .database import Base, engine, get_db

app = FastAPI(title="Controle Financeiro Clínica", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


# --------- Planos de saúde ---------


@app.get("/api/health-plans", response_model=list[schemas.HealthPlanRead])
def list_health_plans(db: Session = Depends(get_db)) -> list[models.HealthPlan]:
    return list(db.scalars(select(models.HealthPlan).order_by(models.HealthPlan.name)))


@app.post("/api/health-plans", response_model=schemas.HealthPlanRead, status_code=201)
def create_health_plan(
    data: schemas.HealthPlanCreate, db: Session = Depends(get_db)
) -> models.HealthPlan:
    obj = models.HealthPlan(name=data.name.strip())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um plano com esse nome.") from e
    db.refresh(obj)
    return obj


@app.delete("/api/health-plans/{health_plan_id}", status_code=204)
def delete_health_plan(health_plan_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.HealthPlan, health_plan_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    db.delete(obj)
    db.commit()


# --------- Especialidades ---------


@app.get("/api/specialties", response_model=list[schemas.SpecialtyRead])
def list_specialties(db: Session = Depends(get_db)) -> list[models.Specialty]:
    return list(db.scalars(select(models.Specialty).order_by(models.Specialty.name)))


@app.post("/api/specialties", response_model=schemas.SpecialtyRead, status_code=201)
def create_specialty(
    data: schemas.SpecialtyCreate, db: Session = Depends(get_db)
) -> models.Specialty:
    obj = models.Specialty(name=data.name.strip())
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Já existe uma especialidade com esse nome."
        ) from e
    db.refresh(obj)
    return obj


@app.delete("/api/specialties/{specialty_id}", status_code=204)
def delete_specialty(specialty_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.Specialty, specialty_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Especialidade não encontrada.")
    db.delete(obj)
    db.commit()


# --------- Preços por especialidade × plano ---------


@app.get("/api/specialty-prices", response_model=list[schemas.SpecialtyPriceDetailed])
def list_specialty_prices(db: Session = Depends(get_db)) -> list[schemas.SpecialtyPriceDetailed]:
    rows = list(
        db.scalars(
            select(models.SpecialtyPrice)
            .options(
                selectinload(models.SpecialtyPrice.specialty),
                selectinload(models.SpecialtyPrice.health_plan),
            )
            .order_by(models.SpecialtyPrice.id)
        )
    )
    return [
        schemas.SpecialtyPriceDetailed(
            id=r.id,
            specialty_id=r.specialty_id,
            health_plan_id=r.health_plan_id,
            value=r.value,
            specialty_name=r.specialty.name,
            health_plan_name=r.health_plan.name,
        )
        for r in rows
    ]


@app.post("/api/specialty-prices", response_model=schemas.SpecialtyPriceRead, status_code=201)
def upsert_specialty_price(
    data: schemas.SpecialtyPriceCreate, db: Session = Depends(get_db)
) -> models.SpecialtyPrice:
    existing = db.scalar(
        select(models.SpecialtyPrice).where(
            models.SpecialtyPrice.specialty_id == data.specialty_id,
            models.SpecialtyPrice.health_plan_id == data.health_plan_id,
        )
    )
    if existing:
        existing.value = data.value
        db.commit()
        db.refresh(existing)
        return existing

    if not db.get(models.Specialty, data.specialty_id):
        raise HTTPException(status_code=404, detail="Especialidade não encontrada.")
    if not db.get(models.HealthPlan, data.health_plan_id):
        raise HTTPException(status_code=404, detail="Plano não encontrado.")

    obj = models.SpecialtyPrice(
        specialty_id=data.specialty_id,
        health_plan_id=data.health_plan_id,
        value=data.value,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/specialty-prices/{price_id}", status_code=204)
def delete_specialty_price(price_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.SpecialtyPrice, price_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Preço não encontrado.")
    db.delete(obj)
    db.commit()


# --------- Pacientes ---------


def _patient_read(p: models.Patient) -> schemas.PatientRead:
    return schemas.PatientRead(
        id=p.id,
        name=p.name,
        health_plan_id=p.health_plan_id,
        active=p.active,
        health_plan_name=p.health_plan.name if p.health_plan else None,
    )


@app.get("/api/patients", response_model=list[schemas.PatientRead])
def list_patients(db: Session = Depends(get_db)) -> list[schemas.PatientRead]:
    rows = list(
        db.scalars(
            select(models.Patient)
            .options(selectinload(models.Patient.health_plan))
            .order_by(models.Patient.name)
        )
    )
    return [_patient_read(p) for p in rows]


@app.post("/api/patients", response_model=schemas.PatientRead, status_code=201)
def create_patient(
    data: schemas.PatientCreate, db: Session = Depends(get_db)
) -> schemas.PatientRead:
    if not db.get(models.HealthPlan, data.health_plan_id):
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    obj = models.Patient(name=data.name.strip(), health_plan_id=data.health_plan_id, active=data.active)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _patient_read(obj)


@app.put("/api/patients/{patient_id}", response_model=schemas.PatientRead)
def update_patient(
    patient_id: int,
    data: schemas.PatientUpdate,
    db: Session = Depends(get_db),
) -> schemas.PatientRead:
    obj = db.get(models.Patient, patient_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    if data.name is not None:
        obj.name = data.name.strip()
    if data.health_plan_id is not None:
        if not db.get(models.HealthPlan, data.health_plan_id):
            raise HTTPException(status_code=404, detail="Plano não encontrado.")
        obj.health_plan_id = data.health_plan_id
    if data.active is not None:
        obj.active = data.active
    db.commit()
    db.refresh(obj)
    return _patient_read(obj)


@app.delete("/api/patients/{patient_id}", status_code=204)
def delete_patient(patient_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.Patient, patient_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    db.delete(obj)
    db.commit()


# --------- Plano semanal ---------


@app.get(
    "/api/patients/{patient_id}/weekly-plan",
    response_model=list[schemas.WeeklyPlanEntryRead],
)
def list_weekly_plan(
    patient_id: int, db: Session = Depends(get_db)
) -> list[schemas.WeeklyPlanEntryRead]:
    patient = db.get(models.Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    rows = list(
        db.scalars(
            select(models.WeeklyPlanEntry)
            .options(selectinload(models.WeeklyPlanEntry.specialty))
            .where(models.WeeklyPlanEntry.patient_id == patient_id)
            .order_by(models.WeeklyPlanEntry.day_of_week)
        )
    )
    return [
        schemas.WeeklyPlanEntryRead(
            id=e.id,
            patient_id=e.patient_id,
            day_of_week=e.day_of_week,
            specialty_id=e.specialty_id,
            sessions=e.sessions,
            specialty_name=e.specialty.name if e.specialty else None,
        )
        for e in rows
    ]


@app.post(
    "/api/patients/{patient_id}/weekly-plan",
    response_model=schemas.WeeklyPlanEntryRead,
    status_code=201,
)
def upsert_weekly_plan_entry(
    patient_id: int,
    data: schemas.WeeklyPlanEntryCreate,
    db: Session = Depends(get_db),
) -> schemas.WeeklyPlanEntryRead:
    if not db.get(models.Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    if not db.get(models.Specialty, data.specialty_id):
        raise HTTPException(status_code=404, detail="Especialidade não encontrada.")

    existing = db.scalar(
        select(models.WeeklyPlanEntry).where(
            models.WeeklyPlanEntry.patient_id == patient_id,
            models.WeeklyPlanEntry.day_of_week == data.day_of_week,
            models.WeeklyPlanEntry.specialty_id == data.specialty_id,
        )
    )
    if existing:
        existing.sessions = data.sessions
        db.commit()
        db.refresh(existing)
        obj = existing
    else:
        obj = models.WeeklyPlanEntry(
            patient_id=patient_id,
            day_of_week=data.day_of_week,
            specialty_id=data.specialty_id,
            sessions=data.sessions,
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)

    specialty = db.get(models.Specialty, obj.specialty_id)
    return schemas.WeeklyPlanEntryRead(
        id=obj.id,
        patient_id=obj.patient_id,
        day_of_week=obj.day_of_week,
        specialty_id=obj.specialty_id,
        sessions=obj.sessions,
        specialty_name=specialty.name if specialty else None,
    )


@app.delete("/api/weekly-plan/{entry_id}", status_code=204)
def delete_weekly_plan_entry(entry_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.WeeklyPlanEntry, entry_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")
    db.delete(obj)
    db.commit()


# --------- Faltas (por data) ---------


def _impacted_specialties(db: Session, patient: models.Patient, day_of_week: int) -> list[str]:
    """Retorna as especialidades planejadas do paciente naquele dia da semana."""
    names: list[str] = []
    seen: set[int] = set()
    for entry in patient.weekly_entries:
        if entry.day_of_week == day_of_week and entry.specialty_id not in seen:
            seen.add(entry.specialty_id)
            specialty = db.get(models.Specialty, entry.specialty_id)
            if specialty:
                names.append(specialty.name)
    return sorted(names)


@app.get("/api/absence-days", response_model=list[schemas.AbsenceDayDetailed])
def list_absence_days(
    patient_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
) -> list[schemas.AbsenceDayDetailed]:
    patient = db.scalar(
        select(models.Patient)
        .options(selectinload(models.Patient.weekly_entries))
        .where(models.Patient.id == patient_id)
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    rows = list(
        db.scalars(
            select(models.AbsenceDay).where(
                models.AbsenceDay.patient_id == patient_id,
            )
        )
    )
    result: list[schemas.AbsenceDayDetailed] = []
    for a in rows:
        if a.date.year != year or a.date.month != month:
            continue
        dow = a.date.weekday()
        result.append(
            schemas.AbsenceDayDetailed(
                id=a.id,
                patient_id=a.patient_id,
                date=a.date,
                note=a.note,
                day_of_week=dow,
                impacted_specialties=_impacted_specialties(db, patient, dow),
            )
        )
    result.sort(key=lambda r: r.date)
    return result


@app.post("/api/absence-days", response_model=schemas.AbsenceDayDetailed, status_code=201)
def upsert_absence_day(
    data: schemas.AbsenceDayCreate, db: Session = Depends(get_db)
) -> schemas.AbsenceDayDetailed:
    patient = db.scalar(
        select(models.Patient)
        .options(selectinload(models.Patient.weekly_entries))
        .where(models.Patient.id == data.patient_id)
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")

    existing = db.scalar(
        select(models.AbsenceDay).where(
            models.AbsenceDay.patient_id == data.patient_id,
            models.AbsenceDay.date == data.date,
        )
    )
    if existing:
        existing.note = data.note
        db.commit()
        db.refresh(existing)
        obj = existing
    else:
        obj = models.AbsenceDay(
            patient_id=data.patient_id,
            date=data.date,
            note=data.note,
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)

    dow = obj.date.weekday()
    return schemas.AbsenceDayDetailed(
        id=obj.id,
        patient_id=obj.patient_id,
        date=obj.date,
        note=obj.note,
        day_of_week=dow,
        impacted_specialties=_impacted_specialties(db, patient, dow),
    )


@app.delete("/api/absence-days/{absence_id}", status_code=204)
def delete_absence_day(absence_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.AbsenceDay, absence_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Falta não encontrada.")
    db.delete(obj)
    db.commit()


# --------- Relatórios ---------


def _load_patient_full(db: Session, patient_id: int) -> models.Patient | None:
    return db.scalar(
        select(models.Patient)
        .options(
            selectinload(models.Patient.weekly_entries),
            selectinload(models.Patient.absence_days),
            selectinload(models.Patient.health_plan).selectinload(models.HealthPlan.prices),
        )
        .where(models.Patient.id == patient_id)
    )


@app.get(
    "/api/reports/patient/{patient_id}",
    response_model=schemas.PatientMonthReport,
)
def patient_report(
    patient_id: int, year: int, month: int, db: Session = Depends(get_db)
) -> schemas.PatientMonthReport:
    patient = _load_patient_full(db, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    return billing.compute_patient_month(db, patient, year, month)


@app.get(
    "/api/reports/health-plan/{health_plan_id}",
    response_model=schemas.HealthPlanMonthReport,
)
def health_plan_report(
    health_plan_id: int, year: int, month: int, db: Session = Depends(get_db)
) -> schemas.HealthPlanMonthReport:
    plan = db.get(models.HealthPlan, health_plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")

    patient_ids = list(
        db.scalars(
            select(models.Patient.id).where(models.Patient.health_plan_id == health_plan_id)
        )
    )
    reports: list[schemas.PatientMonthReport] = []
    for pid in patient_ids:
        p = _load_patient_full(db, pid)
        if p:
            reports.append(billing.compute_patient_month(db, p, year, month))

    reports.sort(key=lambda r: r.patient_name)
    total = round(sum(r.total for r in reports), 2)
    return schemas.HealthPlanMonthReport(
        health_plan_id=health_plan_id,
        health_plan_name=plan.name,
        year=year,
        month=month,
        patients=reports,
        total=total,
    )
