from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


INVOICE_STATUSES = (
    "em_aberto",
    "emitida",
    "enviada",
    "paga",
    "paga_parcial",
    "paga_excedente",
    "cancelada",
)


class HealthPlan(Base):
    __tablename__ = "health_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    patients: Mapped[list["Patient"]] = relationship(back_populates="health_plan")
    prices: Mapped[list["SpecialtyPrice"]] = relationship(
        back_populates="health_plan", cascade="all, delete-orphan"
    )


class Specialty(Base):
    __tablename__ = "specialties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=999, nullable=False)

    prices: Mapped[list["SpecialtyPrice"]] = relationship(
        back_populates="specialty", cascade="all, delete-orphan"
    )
    weekly_entries: Mapped[list["WeeklyPlanEntry"]] = relationship(
        back_populates="specialty", cascade="all, delete-orphan"
    )


class SpecialtyPrice(Base):
    __tablename__ = "specialty_prices"
    __table_args__ = (
        UniqueConstraint("specialty_id", "health_plan_id", name="uq_specialty_health_plan"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"), nullable=False)
    health_plan_id: Mapped[int] = mapped_column(ForeignKey("health_plans.id"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    therapy_code: Mapped[str | None] = mapped_column(String(50), nullable=True)

    specialty: Mapped[Specialty] = relationship(back_populates="prices")
    health_plan: Mapped[HealthPlan] = relationship(back_populates="prices")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cpf: Mapped[str | None] = mapped_column(String(20), nullable=True)
    beneficiary: Mapped[str | None] = mapped_column(String(200), nullable=True)
    health_plan_id: Mapped[int] = mapped_column(ForeignKey("health_plans.id"), nullable=False)
    active: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    health_plan: Mapped[HealthPlan] = relationship(back_populates="patients")
    weekly_entries: Mapped[list["WeeklyPlanEntry"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    absence_days: Mapped[list["AbsenceDay"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )


class WeeklyPlanEntry(Base):
    """Uma entrada do plano semanal: paciente X, no dia da semana Y,
    faz Z sessões da especialidade W."""

    __tablename__ = "weekly_plan_entries"
    __table_args__ = (
        UniqueConstraint(
            "patient_id", "day_of_week", "specialty_id", name="uq_weekly_plan_entry"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), nullable=False)
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Seg .. 6=Dom
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"), nullable=False)
    sessions: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    patient: Mapped[Patient] = relationship(back_populates="weekly_entries")
    specialty: Mapped[Specialty] = relationship(back_populates="weekly_entries")


class Holiday(Base):
    """Feriado global da clínica. Datas marcadas aqui são descontadas do
    cálculo de dias úteis para todos os pacientes.
    """

    __tablename__ = "holidays"
    __table_args__ = (
        UniqueConstraint("date", name="uq_holiday_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)


class AbsenceDay(Base):
    """Dia em que o paciente faltou à clínica.

    A partir do plano semanal do paciente, o sistema descobre automaticamente quais
    especialidades foram impactadas naquele dia da semana e desconta do faturamento.
    """

    __tablename__ = "absence_days"
    __table_args__ = (
        UniqueConstraint("patient_id", "date", name="uq_absence_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    patient: Mapped[Patient] = relationship(back_populates="absence_days")


class Invoice(Base):
    """Nota fiscal emitida para cobrança de um paciente/plano de saúde."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    patient_id: Mapped[int | None] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), nullable=True
    )
    patient_name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference_year: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_month: Mapped[int] = mapped_column(Integer, nullable=False)
    health_plan_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gross_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    net_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    taxes: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="em_aberto", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    patient: Mapped[Patient | None] = relationship()
    receipt_links: Mapped[list["ReceiptInvoice"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


RECEIPT_PAYER_TYPES = ("health_plan", "patient", "other")


class Receipt(Base):
    """Recebimento (entrada de caixa). Pode estar vinculado a uma ou mais
    notas fiscais via tabela ReceiptInvoice.
    """

    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(primary_key=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    payer_type: Mapped[str] = mapped_column(String(20), nullable=False)
    payer_health_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("health_plans.id", ondelete="SET NULL"), nullable=True
    )
    payer_patient_id: Mapped[int | None] = mapped_column(
        ForeignKey("patients.id", ondelete="SET NULL"), nullable=True
    )
    payer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    linked_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    invoice_links: Mapped[list["ReceiptInvoice"]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )


class ReceiptInvoice(Base):
    """Vínculo entre um recebimento e uma nota fiscal."""

    __tablename__ = "receipt_invoices"
    __table_args__ = (
        UniqueConstraint("receipt_id", "invoice_id", name="uq_receipt_invoice"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("receipts.id", ondelete="CASCADE"), nullable=False
    )
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )

    receipt: Mapped[Receipt] = relationship(back_populates="invoice_links")
    invoice: Mapped[Invoice] = relationship(back_populates="receipt_links")
