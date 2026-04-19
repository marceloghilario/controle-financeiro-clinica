from datetime import date as date_type
from datetime import datetime as datetime_type
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


InvoiceStatus = Literal["em_aberto", "emitida", "enviada", "paga", "cancelada"]


class HealthPlanBase(BaseModel):
    name: str


class HealthPlanCreate(HealthPlanBase):
    pass


class HealthPlanRead(HealthPlanBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SpecialtyBase(BaseModel):
    name: str


class SpecialtyCreate(SpecialtyBase):
    pass


class SpecialtyRead(SpecialtyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SpecialtyPriceBase(BaseModel):
    specialty_id: int
    health_plan_id: int
    value: float = Field(ge=0)


class SpecialtyPriceCreate(SpecialtyPriceBase):
    pass


class SpecialtyPriceRead(SpecialtyPriceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SpecialtyPriceDetailed(SpecialtyPriceRead):
    specialty_name: str
    health_plan_name: str


class PatientBase(BaseModel):
    name: str
    cpf: str | None = None
    beneficiary: str | None = None
    health_plan_id: int
    active: int = 1


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: str | None = None
    cpf: str | None = None
    beneficiary: str | None = None
    health_plan_id: int | None = None
    active: int | None = None


class PatientRead(PatientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    health_plan_name: str | None = None


class WeeklyPlanEntryBase(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    specialty_id: int
    sessions: int = Field(ge=1)


class WeeklyPlanEntryCreate(WeeklyPlanEntryBase):
    pass


class WeeklyPlanEntryRead(WeeklyPlanEntryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    specialty_name: str | None = None


class AbsenceDayBase(BaseModel):
    patient_id: int
    date: date_type
    note: str | None = None


class AbsenceDayCreate(AbsenceDayBase):
    pass


class AbsenceDayRead(AbsenceDayBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class AbsenceDayDetailed(AbsenceDayRead):
    day_of_week: int
    impacted_specialties: list[str]


class SpecialtyReportItem(BaseModel):
    specialty_id: int
    specialty_name: str
    sessions_planned: int
    absences: int
    sessions_billed: int
    unit_value: float
    total: float


class AbsenceDetail(BaseModel):
    date: date_type
    day_of_week: int
    impacted_specialties: list[str]


class PatientMonthReport(BaseModel):
    patient_id: int
    patient_name: str
    patient_cpf: str | None = None
    patient_beneficiary: str | None = None
    health_plan_id: int
    health_plan_name: str
    year: int
    month: int
    business_days_by_weekday: dict[int, int]
    items: list[SpecialtyReportItem]
    absence_days: list[AbsenceDetail]
    total: float


class HealthPlanMonthReport(BaseModel):
    health_plan_id: int
    health_plan_name: str
    year: int
    month: int
    patients: list[PatientMonthReport]
    total: float


class InvoiceBase(BaseModel):
    number: str | None = None
    issue_date: date_type
    patient_id: int | None = None
    patient_name: str
    reference_year: int = Field(ge=2000, le=2100)
    reference_month: int = Field(ge=1, le=12)
    health_plan_name: str | None = None
    gross_value: float = Field(ge=0)
    net_value: float = Field(ge=0)
    taxes: float = Field(ge=0)
    notes: str | None = None
    status: InvoiceStatus = "em_aberto"


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceUpdate(BaseModel):
    number: str | None = None
    issue_date: date_type | None = None
    patient_id: int | None = None
    patient_name: str | None = None
    reference_year: int | None = Field(default=None, ge=2000, le=2100)
    reference_month: int | None = Field(default=None, ge=1, le=12)
    health_plan_name: str | None = None
    gross_value: float | None = Field(default=None, ge=0)
    net_value: float | None = Field(default=None, ge=0)
    taxes: float | None = Field(default=None, ge=0)
    notes: str | None = None
    status: InvoiceStatus | None = None


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceRead(InvoiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime_type
