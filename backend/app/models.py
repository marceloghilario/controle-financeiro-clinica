from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class HealthPlan(Base):
    __tablename__ = "health_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    patients: Mapped[list["Patient"]] = relationship(back_populates="health_plan")
    prices: Mapped[list["SpecialtyPrice"]] = relationship(
        back_populates="health_plan", cascade="all, delete-orphan"
    )


class Specialty(Base):
    __tablename__ = "specialties"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    prices: Mapped[list["SpecialtyPrice"]] = relationship(
        back_populates="specialty", cascade="all, delete-orphan"
    )
    weekly_entries: Mapped[list["WeeklyPlanEntry"]] = relationship(
        back_populates="specialty", cascade="all, delete-orphan"
    )
    absences: Mapped[list["MonthlyAbsence"]] = relationship(
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

    specialty: Mapped[Specialty] = relationship(back_populates="prices")
    health_plan: Mapped[HealthPlan] = relationship(back_populates="prices")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    health_plan_id: Mapped[int] = mapped_column(ForeignKey("health_plans.id"), nullable=False)
    active: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    health_plan: Mapped[HealthPlan] = relationship(back_populates="patients")
    weekly_entries: Mapped[list["WeeklyPlanEntry"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    absences: Mapped[list["MonthlyAbsence"]] = relationship(
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


class MonthlyAbsence(Base):
    """Faltas registradas por paciente+especialidade em um mês específico."""

    __tablename__ = "monthly_absences"
    __table_args__ = (
        UniqueConstraint(
            "patient_id", "specialty_id", "year", "month", name="uq_monthly_absence"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), nullable=False)
    specialty_id: Mapped[int] = mapped_column(ForeignKey("specialties.id"), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..12
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    patient: Mapped[Patient] = relationship(back_populates="absences")
    specialty: Mapped[Specialty] = relationship(back_populates="absences")
