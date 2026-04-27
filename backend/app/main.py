from __future__ import annotations

from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import auth as auth_mod
from . import billing, models, schemas
from .auth import (
    SEED_ADMIN_EMAIL,
    create_access_token,
    decode_access_token,
    get_current_user,
    hash_password,
    is_seed_admin,
    require_admin,
    verify_google_id_token,
    verify_password,
)
from .database import Base, engine, get_db, SessionLocal


def _migrate_sqlite() -> None:
    """Aplica pequenas migrações idempotentes em bancos SQLite existentes
    (adiciona colunas novas quando o modelo evolui).
    """
    if not engine.url.drivername.startswith("sqlite"):
        return
    with engine.begin() as conn:
        cols = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(patients)").fetchall()
        }
        if "cpf" not in cols:
            conn.exec_driver_sql("ALTER TABLE patients ADD COLUMN cpf VARCHAR(20)")
        if "beneficiary" not in cols:
            conn.exec_driver_sql(
                "ALTER TABLE patients ADD COLUMN beneficiary VARCHAR(200)"
            )
        price_cols = {
            row[1]
            for row in conn.exec_driver_sql(
                "PRAGMA table_info(specialty_prices)"
            ).fetchall()
        }
        if price_cols and "therapy_code" not in price_cols:
            conn.exec_driver_sql(
                "ALTER TABLE specialty_prices ADD COLUMN therapy_code VARCHAR(50)"
            )
        plan_cols = {
            row[1]
            for row in conn.exec_driver_sql(
                "PRAGMA table_info(health_plans)"
            ).fetchall()
        }
        if plan_cols and "cnpj" not in plan_cols:
            conn.exec_driver_sql("ALTER TABLE health_plans ADD COLUMN cnpj VARCHAR(20)")
        if plan_cols and "notes" not in plan_cols:
            conn.exec_driver_sql("ALTER TABLE health_plans ADD COLUMN notes VARCHAR(500)")
        receipts_cols = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(receipts)").fetchall()
        }
        if receipts_cols and "linked_status" not in receipts_cols:
            conn.exec_driver_sql(
                "ALTER TABLE receipts ADD COLUMN linked_status VARCHAR(20)"
            )
        spec_cols = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(specialties)").fetchall()
        }
        if spec_cols and "display_order" not in spec_cols:
            conn.exec_driver_sql(
                "ALTER TABLE specialties ADD COLUMN display_order INTEGER NOT NULL DEFAULT 999"
            )
            _seed_specialty_order(conn)


_DEFAULT_SPECIALTY_ORDER = [
    "psicologia aba",
    "fonoaudiologia",
    "fonoaudiologia pecs",
    "terapia ocupacional - is",
    "fisioterapia",
    "pediasuit",
    "psicomotricidade",
    "nutricao",
    "psicopedagogia",
    "ed fisica esp",
    "musicoterapia",
]


def _normalize_for_match(s: str) -> str:
    import unicodedata

    s = (s or "").strip().lower()
    s = "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )
    return " ".join(s.split())


_DEFAULT_SPECIALTY_ALIASES: dict[str, str] = {
    # mapeia variações comuns para um dos nomes da lista padrão
    "educacao fisica": "ed fisica esp",
    "educacao fisica especializada": "ed fisica esp",
    "ed. fisica esp": "ed fisica esp",
    "ed. fisica": "ed fisica esp",
    "ed fisica": "ed fisica esp",
    "fono pecs": "fonoaudiologia pecs",
    "psico aba": "psicologia aba",
    "to is": "terapia ocupacional - is",
    "to - is": "terapia ocupacional - is",
    "terapia ocupacional is": "terapia ocupacional - is",
    "fisio": "fisioterapia",
    "nutri": "nutricao",
}


def _match_default_order(name: str) -> int | None:
    n = _normalize_for_match(name)
    if n in _DEFAULT_SPECIALTY_ORDER:
        return _DEFAULT_SPECIALTY_ORDER.index(n) + 1
    if n in _DEFAULT_SPECIALTY_ALIASES:
        canonical = _DEFAULT_SPECIALTY_ALIASES[n]
        if canonical in _DEFAULT_SPECIALTY_ORDER:
            return _DEFAULT_SPECIALTY_ORDER.index(canonical) + 1
    return None


def _seed_specialty_order(conn, only_unset: bool = False) -> None:
    rows = conn.exec_driver_sql(
        "SELECT id, name, display_order FROM specialties"
    ).fetchall()
    for sid, name, current_order in rows:
        if only_unset and current_order != 999:
            continue
        order = _match_default_order(name)
        if order is not None:
            conn.exec_driver_sql(
                "UPDATE specialties SET display_order = ? WHERE id = ?",
                (order, sid),
            )


def _seed_admin_user() -> None:
    """Garante que o admin semente (marceloghilario@gmail.com) existe e está ativo."""
    db = SessionLocal()
    try:
        existing = db.scalar(
            select(models.User).where(func.lower(models.User.email) == SEED_ADMIN_EMAIL)
        )
        if existing is None:
            db.add(
                models.User(
                    email=SEED_ADMIN_EMAIL,
                    name="Marcelo Hilario",
                    role="admin",
                    status="active",
                    approved_at=datetime.utcnow(),
                )
            )
            db.commit()
        else:
            changed = False
            if existing.role != "admin":
                existing.role = "admin"
                changed = True
            if existing.status != "active":
                existing.status = "active"
                if existing.approved_at is None:
                    existing.approved_at = datetime.utcnow()
                changed = True
            if changed:
                db.commit()
    finally:
        db.close()


Base.metadata.create_all(bind=engine)
_migrate_sqlite()
_seed_admin_user()


# Rotas que NÃO exigem autenticação (prefixos):
PUBLIC_PATH_PREFIXES = (
    "/healthz",
    "/api/auth/",
    "/docs",
    "/openapi.json",
    "/redoc",
)


app = FastAPI(title="Controle Financeiro Clínica", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Bloqueia chamadas a /api/* sem token válido (exceto /api/auth/*)."""
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
    if not path.startswith("/api/"):
        return await call_next(request)
    if any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("Authorization") or ""
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(None, 1)[1].strip() or None
    if not token:
        return JSONResponse(
            status_code=401, content={"detail": "Não autenticado."}
        )
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return JSONResponse(status_code=401, content={"detail": "Sessão inválida."})
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        return JSONResponse(status_code=401, content={"detail": "Sessão inválida."})
    db = SessionLocal()
    try:
        user = db.get(models.User, user_id)
        if not user or user.status != "active":
            return JSONResponse(
                status_code=403,
                content={"detail": "Acesso pendente ou revogado."},
            )
    finally:
        db.close()
    return await call_next(request)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


# --------- Auth ---------


def _user_to_read(u: models.User) -> schemas.UserRead:
    return schemas.UserRead(
        id=u.id,
        email=u.email,
        name=u.name,
        role=u.role,
        status=u.status,
        permissions=u.permissions,
        created_at=u.created_at,
        approved_at=u.approved_at,
        has_password=bool(u.password_hash),
    )


@app.post("/api/auth/register", response_model=schemas.AuthResponse)
def auth_register(
    data: schemas.AuthRegister, db: Session = Depends(get_db)
) -> schemas.AuthResponse:
    email_norm = data.email.strip().lower()
    existing = db.scalar(
        select(models.User).where(func.lower(models.User.email) == email_norm)
    )
    if existing is not None:
        if existing.password_hash:
            raise HTTPException(
                status_code=409, detail="Já existe uma conta com esse e-mail."
            )
        # Conta criada antes via Google: completar com senha agora.
        existing.password_hash = hash_password(data.password)
        if data.name and not existing.name:
            existing.name = data.name.strip()
        db.commit()
        db.refresh(existing)
        if existing.status == "active":
            return schemas.AuthResponse(
                access_token=create_access_token(existing.id),
                user=_user_to_read(existing),
            )
        return schemas.AuthResponse(pending=True, user=_user_to_read(existing))

    is_seed = is_seed_admin(email_norm)
    user = models.User(
        email=email_norm,
        name=data.name.strip() or email_norm,
        password_hash=hash_password(data.password),
        role="admin" if is_seed else "user",
        status="active" if is_seed else "pending",
        approved_at=datetime.utcnow() if is_seed else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if user.status == "active":
        return schemas.AuthResponse(
            access_token=create_access_token(user.id),
            user=_user_to_read(user),
        )
    return schemas.AuthResponse(pending=True, user=_user_to_read(user))


@app.post("/api/auth/login", response_model=schemas.AuthResponse)
def auth_login(
    data: schemas.AuthLogin, db: Session = Depends(get_db)
) -> schemas.AuthResponse:
    email_norm = data.email.strip().lower()
    user = db.scalar(
        select(models.User).where(func.lower(models.User.email) == email_norm)
    )
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos.")
    if user.status == "revoked":
        raise HTTPException(status_code=403, detail="Acesso revogado.")
    if user.status == "pending":
        return schemas.AuthResponse(pending=True, user=_user_to_read(user))
    return schemas.AuthResponse(
        access_token=create_access_token(user.id),
        user=_user_to_read(user),
    )


@app.post("/api/auth/google", response_model=schemas.AuthResponse)
def auth_google(
    data: schemas.AuthGoogle, db: Session = Depends(get_db)
) -> schemas.AuthResponse:
    info = verify_google_id_token(data.id_token)
    email_norm = (info.get("email") or "").strip().lower()
    sub = info.get("sub") or ""
    name = info.get("name") or email_norm
    user = db.scalar(
        select(models.User).where(func.lower(models.User.email) == email_norm)
    )
    if user is None:
        is_seed = is_seed_admin(email_norm)
        user = models.User(
            email=email_norm,
            name=name,
            google_sub=sub,
            role="admin" if is_seed else "user",
            status="active" if is_seed else "pending",
            approved_at=datetime.utcnow() if is_seed else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if not user.google_sub:
            user.google_sub = sub
            changed = True
        if is_seed_admin(email_norm) and user.status != "active":
            user.status = "active"
            user.role = "admin"
            user.approved_at = user.approved_at or datetime.utcnow()
            changed = True
        if changed:
            db.commit()
            db.refresh(user)

    if user.status == "revoked":
        raise HTTPException(status_code=403, detail="Acesso revogado.")
    if user.status == "pending":
        return schemas.AuthResponse(pending=True, user=_user_to_read(user))
    return schemas.AuthResponse(
        access_token=create_access_token(user.id),
        user=_user_to_read(user),
    )


@app.get("/api/auth/me", response_model=schemas.UserRead)
def auth_me(user: models.User = Depends(get_current_user)) -> schemas.UserRead:
    return _user_to_read(user)


@app.post("/api/auth/change-password", response_model=schemas.UserRead)
def auth_change_password(
    data: schemas.AuthChangePassword,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
) -> schemas.UserRead:
    # Se o usuário já tinha senha cadastrada, exige a senha atual.
    if user.password_hash:
        if not data.current_password or not verify_password(
            data.current_password, user.password_hash
        ):
            raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    db.refresh(user)
    return _user_to_read(user)


@app.get("/api/auth/config")
def auth_config() -> dict[str, str | bool]:
    return {
        "google_client_id": auth_mod.GOOGLE_CLIENT_ID,
        "google_enabled": bool(auth_mod.GOOGLE_CLIENT_ID),
    }


# --------- Usuários (admin) ---------


@app.get("/api/users", response_model=list[schemas.UserRead])
def list_users(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_admin),
) -> list[schemas.UserRead]:
    rows = list(db.scalars(select(models.User).order_by(models.User.created_at.desc())))
    return [_user_to_read(u) for u in rows]


@app.patch("/api/users/{user_id}", response_model=schemas.UserRead)
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
) -> schemas.UserRead:
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user.id == admin.id and (
        data.role is not None and data.role != "admin"
        or data.status is not None and data.status != "active"
    ):
        raise HTTPException(
            status_code=400,
            detail="Você não pode rebaixar ou desativar a si mesmo.",
        )
    if data.role is not None:
        user.role = data.role
    if data.status is not None:
        if user.status == "pending" and data.status == "active" and user.approved_at is None:
            user.approved_at = datetime.utcnow()
        user.status = data.status
    if data.permissions is not None:
        user.permissions = data.permissions
    db.commit()
    db.refresh(user)
    return _user_to_read(user)


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_admin),
) -> None:
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Você não pode se excluir.")
    db.delete(user)
    db.commit()


# --------- Planos de saúde ---------


@app.get("/api/health-plans", response_model=list[schemas.HealthPlanRead])
def list_health_plans(db: Session = Depends(get_db)) -> list[models.HealthPlan]:
    return list(db.scalars(select(models.HealthPlan).order_by(models.HealthPlan.name)))


@app.post("/api/health-plans", response_model=schemas.HealthPlanRead, status_code=201)
def create_health_plan(
    data: schemas.HealthPlanCreate, db: Session = Depends(get_db)
) -> models.HealthPlan:
    obj = models.HealthPlan(
        name=data.name.strip(),
        cnpj=(data.cnpj or "").strip() or None,
        notes=(data.notes or "").strip() or None,
    )
    db.add(obj)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um plano com esse nome.") from e
    db.refresh(obj)
    return obj


@app.put("/api/health-plans/{health_plan_id}", response_model=schemas.HealthPlanRead)
def update_health_plan(
    health_plan_id: int,
    data: schemas.HealthPlanUpdate,
    db: Session = Depends(get_db),
) -> models.HealthPlan:
    obj = db.get(models.HealthPlan, health_plan_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    if data.name is not None:
        obj.name = data.name.strip()
    if data.cnpj is not None:
        obj.cnpj = data.cnpj.strip() or None
    if data.notes is not None:
        obj.notes = data.notes.strip() or None
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
    return list(
        db.scalars(
            select(models.Specialty).order_by(
                models.Specialty.display_order, models.Specialty.name
            )
        )
    )


@app.post("/api/specialties/reorder", response_model=list[schemas.SpecialtyRead])
def reorder_specialties(
    data: schemas.SpecialtyReorder, db: Session = Depends(get_db)
) -> list[models.Specialty]:
    for index, sid in enumerate(data.ids):
        obj = db.get(models.Specialty, sid)
        if obj is not None:
            obj.display_order = index + 1
    db.commit()
    return list(
        db.scalars(
            select(models.Specialty).order_by(
                models.Specialty.display_order, models.Specialty.name
            )
        )
    )


@app.post("/api/specialties", response_model=schemas.SpecialtyRead, status_code=201)
def create_specialty(
    data: schemas.SpecialtyCreate, db: Session = Depends(get_db)
) -> models.Specialty:
    name = data.name.strip()
    matched_order: int | None = None
    norm = _normalize_for_match(name)
    if norm in _DEFAULT_SPECIALTY_ORDER:
        matched_order = _DEFAULT_SPECIALTY_ORDER.index(norm) + 1
    if matched_order is None:
        max_order = db.scalar(select(func.max(models.Specialty.display_order))) or 0
        matched_order = max(max_order + 1, len(_DEFAULT_SPECIALTY_ORDER) + 1)
    obj = models.Specialty(name=name, display_order=matched_order)
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


@app.put("/api/specialties/{specialty_id}", response_model=schemas.SpecialtyRead)
def update_specialty(
    specialty_id: int,
    data: schemas.SpecialtyUpdate,
    db: Session = Depends(get_db),
) -> models.Specialty:
    obj = db.get(models.Specialty, specialty_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Especialidade não encontrada.")
    if data.name is not None:
        new_name = data.name.strip()
        if not new_name:
            raise HTTPException(status_code=422, detail="Nome não pode ser vazio.")
        obj.name = new_name
    if data.display_order is not None:
        obj.display_order = data.display_order
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
            therapy_code=r.therapy_code,
            specialty_name=r.specialty.name,
            health_plan_name=r.health_plan.name,
        )
        for r in rows
    ]


@app.post("/api/specialty-prices", response_model=schemas.SpecialtyPriceRead, status_code=201)
def upsert_specialty_price(
    data: schemas.SpecialtyPriceCreate, db: Session = Depends(get_db)
) -> models.SpecialtyPrice:
    therapy_code = (data.therapy_code.strip() if data.therapy_code else None) or None
    existing = db.scalar(
        select(models.SpecialtyPrice).where(
            models.SpecialtyPrice.specialty_id == data.specialty_id,
            models.SpecialtyPrice.health_plan_id == data.health_plan_id,
        )
    )
    if existing:
        existing.value = data.value
        existing.therapy_code = therapy_code
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
        therapy_code=therapy_code,
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
        cpf=p.cpf,
        beneficiary=p.beneficiary,
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
    obj = models.Patient(
        name=data.name.strip(),
        cpf=(data.cpf.strip() if data.cpf else None) or None,
        beneficiary=(data.beneficiary.strip() if data.beneficiary else None) or None,
        health_plan_id=data.health_plan_id,
        active=data.active,
    )
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
    if data.cpf is not None:
        obj.cpf = data.cpf.strip() or None
    if data.beneficiary is not None:
        obj.beneficiary = data.beneficiary.strip() or None
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


# --------- Feriados ---------


@app.get("/api/holidays", response_model=list[schemas.HolidayRead])
def list_holidays(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
) -> list[models.Holiday]:
    query = select(models.Holiday).order_by(models.Holiday.date)
    rows = list(db.scalars(query))
    if year is not None:
        rows = [h for h in rows if h.date.year == year]
    if month is not None:
        rows = [h for h in rows if h.date.month == month]
    return rows


@app.post("/api/holidays", response_model=schemas.HolidayRead, status_code=201)
def create_holiday(
    data: schemas.HolidayCreate, db: Session = Depends(get_db)
) -> models.Holiday:
    description = (data.description.strip() if data.description else None) or None
    existing = db.scalar(select(models.Holiday).where(models.Holiday.date == data.date))
    if existing:
        existing.description = description
        db.commit()
        db.refresh(existing)
        return existing
    obj = models.Holiday(date=data.date, description=description)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.Holiday, holiday_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Feriado não encontrado.")
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


# --------- Notas fiscais ---------


@app.get("/api/invoices", response_model=list[schemas.InvoiceRead])
def list_invoices(db: Session = Depends(get_db)) -> list[models.Invoice]:
    return list(
        db.scalars(
            select(models.Invoice).order_by(
                models.Invoice.issue_date.desc(), models.Invoice.id.desc()
            )
        )
    )


@app.post("/api/invoices", response_model=schemas.InvoiceRead, status_code=201)
def create_invoice(
    data: schemas.InvoiceCreate, db: Session = Depends(get_db)
) -> models.Invoice:
    obj = models.Invoice(
        number=(data.number or None),
        issue_date=data.issue_date,
        patient_id=data.patient_id,
        patient_name=data.patient_name.strip(),
        reference_year=data.reference_year,
        reference_month=data.reference_month,
        health_plan_name=(data.health_plan_name or None),
        gross_value=data.gross_value,
        net_value=data.net_value,
        taxes=data.taxes,
        notes=(data.notes or None),
        status=data.status,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@app.put("/api/invoices/{invoice_id}", response_model=schemas.InvoiceRead)
def update_invoice(
    invoice_id: int, data: schemas.InvoiceUpdate, db: Session = Depends(get_db)
) -> models.Invoice:
    obj = db.get(models.Invoice, invoice_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada.")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@app.patch("/api/invoices/{invoice_id}/status", response_model=schemas.InvoiceRead)
def update_invoice_status(
    invoice_id: int,
    data: schemas.InvoiceStatusUpdate,
    db: Session = Depends(get_db),
) -> models.Invoice:
    obj = db.get(models.Invoice, invoice_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada.")
    obj.status = data.status
    db.commit()
    db.refresh(obj)
    return obj


@app.delete("/api/invoices/{invoice_id}", status_code=204)
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.Invoice, invoice_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada.")
    db.delete(obj)
    db.commit()


# --------- Recebimentos ---------


def _invoice_summary(inv: models.Invoice) -> schemas.ReceiptInvoiceSummary:
    return schemas.ReceiptInvoiceSummary(
        id=inv.id,
        number=inv.number,
        issue_date=inv.issue_date,
        patient_name=inv.patient_name,
        health_plan_name=inv.health_plan_name,
        reference_year=inv.reference_year,
        reference_month=inv.reference_month,
        gross_value=inv.gross_value,
        net_value=inv.net_value,
        status=inv.status,  # type: ignore[arg-type]
    )


def _receipt_read(r: models.Receipt) -> schemas.ReceiptRead:
    return schemas.ReceiptRead(
        id=r.id,
        payment_date=r.payment_date,
        value=r.value,
        payer_type=r.payer_type,  # type: ignore[arg-type]
        payer_health_plan_id=r.payer_health_plan_id,
        payer_patient_id=r.payer_patient_id,
        payer_name=r.payer_name,
        linked_status=r.linked_status,  # type: ignore[arg-type]
        notes=r.notes,
        created_at=r.created_at,
        invoices=[_invoice_summary(link.invoice) for link in r.invoice_links if link.invoice],
    )


def _resolve_payer_name(
    db: Session,
    payer_type: str,
    health_plan_id: int | None,
    patient_id: int | None,
    fallback: str | None,
) -> str:
    if payer_type == "health_plan" and health_plan_id is not None:
        plan = db.get(models.HealthPlan, health_plan_id)
        if plan:
            return plan.name
    if payer_type == "patient" and patient_id is not None:
        pat = db.get(models.Patient, patient_id)
        if pat:
            return pat.name
    return (fallback or "").strip() or "—"


def _candidates_for_payer(
    db: Session,
    payer_type: str,
    health_plan_id: int | None,
    patient_id: int | None,
    *,
    include_invoice_ids: list[int] | None = None,
) -> list[models.Invoice]:
    """Notas em aberto/emitida/enviada para o pagador (descarta paga e cancelada).
    Inclui também notas explícitas em include_invoice_ids (mesmo se já pagas)."""
    query = select(models.Invoice).where(
        models.Invoice.status.in_(("em_aberto", "emitida", "enviada"))
    )
    if payer_type == "health_plan" and health_plan_id is not None:
        plan = db.get(models.HealthPlan, health_plan_id)
        plan_name = plan.name if plan else None
        if plan_name:
            query = query.where(models.Invoice.health_plan_name == plan_name)
    elif payer_type == "patient" and patient_id is not None:
        query = query.where(models.Invoice.patient_id == patient_id)
    rows = list(db.scalars(query.order_by(models.Invoice.issue_date.desc())))
    if include_invoice_ids:
        existing_ids = {i.id for i in rows}
        for iid in include_invoice_ids:
            if iid in existing_ids:
                continue
            inv = db.get(models.Invoice, iid)
            if inv:
                rows.append(inv)
    return rows


def _subset_suggestions(
    invoices: list[models.Invoice],
    target: float,
    *,
    max_size: int = 4,
    max_candidates: int = 20,
    top_n: int = 5,
) -> list[schemas.InvoiceSubsetSuggestion]:
    """Retorna até top_n combinações de invoices cuja soma (líquida) é
    mais próxima do target. Limita a max_candidates entradas e tamanho até max_size
    para manter a complexidade aceitável.
    """
    pool = invoices[:max_candidates]
    n = len(pool)
    found: list[tuple[float, list[int], float, float]] = []  # (diff_net, ids, sum_gross, sum_net)
    # itera pelos tamanhos 1..max_size
    from itertools import combinations

    for size in range(1, max_size + 1):
        if size > n:
            break
        for combo in combinations(range(n), size):
            sum_gross = sum(pool[i].gross_value for i in combo)
            sum_net = sum(pool[i].net_value for i in combo)
            diff_net = abs(sum_net - target)
            diff_gross = abs(sum_gross - target)
            score = min(diff_net, diff_gross)
            ids = [pool[i].id for i in combo]
            found.append((score, ids, sum_gross, sum_net))
    found.sort(key=lambda x: (x[0], len(x[1])))
    seen: set[tuple[int, ...]] = set()
    out: list[schemas.InvoiceSubsetSuggestion] = []
    for score, ids, sg, sn in found:
        key = tuple(sorted(ids))
        if key in seen:
            continue
        seen.add(key)
        out.append(
            schemas.InvoiceSubsetSuggestion(
                invoice_ids=ids,
                sum_gross=sg,
                sum_net=sn,
                diff_gross=abs(sg - target),
                diff_net=abs(sn - target),
            )
        )
        if len(out) >= top_n:
            break
    return out


_PAID_STATUSES = ("paga", "paga_parcial", "paga_excedente")


def _refresh_invoice_status(db: Session, invoice_id: int) -> None:
    """Atualiza o status da nota com base nos vínculos existentes.

    - Se houver vínculo, aplica o linked_status do recebimento mais recente
      (default 'paga' se não definido).
    - Se não houver vínculo e a nota estava marcada como paga/parcial/excedente,
      volta para 'emitida'.
    - Notas canceladas não são alteradas.
    """
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        return
    if inv.status == "cancelada":
        return
    receipt = db.scalar(
        select(models.Receipt)
        .join(
            models.ReceiptInvoice,
            models.ReceiptInvoice.receipt_id == models.Receipt.id,
        )
        .where(models.ReceiptInvoice.invoice_id == invoice_id)
        .order_by(models.Receipt.created_at.desc())
        .limit(1)
    )
    if receipt is not None:
        inv.status = receipt.linked_status or "paga"
    elif inv.status in _PAID_STATUSES:
        inv.status = "emitida"


@app.get("/api/receipts", response_model=list[schemas.ReceiptRead])
def list_receipts(db: Session = Depends(get_db)) -> list[schemas.ReceiptRead]:
    rows = list(
        db.scalars(
            select(models.Receipt)
            .options(
                selectinload(models.Receipt.invoice_links).selectinload(
                    models.ReceiptInvoice.invoice
                )
            )
            .order_by(models.Receipt.payment_date.desc(), models.Receipt.id.desc())
        )
    )
    return [_receipt_read(r) for r in rows]


@app.get(
    "/api/receipts/suggestions",
    response_model=schemas.InvoiceSuggestionsResponse,
)
def receipt_suggestions(
    payer_type: str,
    value: float,
    payer_health_plan_id: int | None = None,
    payer_patient_id: int | None = None,
    db: Session = Depends(get_db),
) -> schemas.InvoiceSuggestionsResponse:
    if payer_type not in models.RECEIPT_PAYER_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de pagador inválido.")
    candidates = _candidates_for_payer(
        db, payer_type, payer_health_plan_id, payer_patient_id
    )
    suggestions = _subset_suggestions(candidates, target=value)
    return schemas.InvoiceSuggestionsResponse(
        candidates=[_invoice_summary(i) for i in candidates],
        suggestions=suggestions,
    )


@app.get("/api/receipts/{receipt_id}", response_model=schemas.ReceiptRead)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)) -> schemas.ReceiptRead:
    r = db.get(models.Receipt, receipt_id)
    if not r:
        raise HTTPException(status_code=404, detail="Recebimento não encontrado.")
    return _receipt_read(r)


@app.post("/api/receipts", response_model=schemas.ReceiptRead, status_code=201)
def create_receipt(
    data: schemas.ReceiptCreate, db: Session = Depends(get_db)
) -> schemas.ReceiptRead:
    if data.payer_type not in models.RECEIPT_PAYER_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de pagador inválido.")
    payer_name = _resolve_payer_name(
        db,
        data.payer_type,
        data.payer_health_plan_id,
        data.payer_patient_id,
        data.payer_name,
    )
    obj = models.Receipt(
        payment_date=data.payment_date,
        value=data.value,
        payer_type=data.payer_type,
        payer_health_plan_id=(
            data.payer_health_plan_id if data.payer_type == "health_plan" else None
        ),
        payer_patient_id=(
            data.payer_patient_id if data.payer_type == "patient" else None
        ),
        payer_name=payer_name,
        notes=(data.notes or None),
    )
    db.add(obj)
    db.flush()
    for inv_id in data.invoice_ids:
        inv = db.get(models.Invoice, inv_id)
        if not inv:
            continue
        db.add(models.ReceiptInvoice(receipt_id=obj.id, invoice_id=inv_id))
    db.flush()
    for inv_id in data.invoice_ids:
        _refresh_invoice_status(db, inv_id)
    db.commit()
    db.refresh(obj)
    return _receipt_read(obj)


@app.put("/api/receipts/{receipt_id}", response_model=schemas.ReceiptRead)
def update_receipt(
    receipt_id: int,
    data: schemas.ReceiptUpdate,
    db: Session = Depends(get_db),
) -> schemas.ReceiptRead:
    obj = db.get(models.Receipt, receipt_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Recebimento não encontrado.")
    fields = data.model_dump(exclude_unset=True)
    invoice_ids = fields.pop("invoice_ids", None)
    for field, value in fields.items():
        setattr(obj, field, value)
    if (
        data.payer_type is not None
        or data.payer_health_plan_id is not None
        or data.payer_patient_id is not None
        or data.payer_name is not None
    ):
        obj.payer_name = _resolve_payer_name(
            db,
            obj.payer_type,
            obj.payer_health_plan_id,
            obj.payer_patient_id,
            obj.payer_name,
        )
    if obj.payer_type == "health_plan":
        obj.payer_patient_id = None
    elif obj.payer_type == "patient":
        obj.payer_health_plan_id = None
    else:
        obj.payer_health_plan_id = None
        obj.payer_patient_id = None

    affected_invoice_ids: set[int] = set()
    if invoice_ids is not None:
        prev_links = list(
            db.scalars(
                select(models.ReceiptInvoice).where(
                    models.ReceiptInvoice.receipt_id == receipt_id
                )
            )
        )
        for link in prev_links:
            affected_invoice_ids.add(link.invoice_id)
            db.delete(link)
        db.flush()
        for inv_id in invoice_ids:
            inv = db.get(models.Invoice, inv_id)
            if not inv:
                continue
            affected_invoice_ids.add(inv_id)
            db.add(models.ReceiptInvoice(receipt_id=receipt_id, invoice_id=inv_id))
        db.flush()
        for inv_id in affected_invoice_ids:
            _refresh_invoice_status(db, inv_id)
    db.commit()
    db.refresh(obj)
    return _receipt_read(obj)


@app.delete("/api/receipts/{receipt_id}", status_code=204)
def delete_receipt(receipt_id: int, db: Session = Depends(get_db)) -> None:
    obj = db.get(models.Receipt, receipt_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Recebimento não encontrado.")
    invoice_ids = [link.invoice_id for link in obj.invoice_links]
    db.delete(obj)
    db.flush()
    for inv_id in invoice_ids:
        _refresh_invoice_status(db, inv_id)
    db.commit()

