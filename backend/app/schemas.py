from datetime import date as date_type
from datetime import datetime as datetime_type
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


UserRole = Literal["admin", "user"]
UserStatus = Literal["pending", "active", "revoked"]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str
    role: UserRole
    status: UserStatus
    permissions: list[str] | None = None
    apps: list[str] = []
    created_at: datetime_type
    approved_at: datetime_type | None = None
    has_password: bool = False


class UserUpdate(BaseModel):
    role: UserRole | None = None
    status: UserStatus | None = None
    permissions: list[str] | None = None


class AuthRegister(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6, max_length=128)


class AuthLogin(BaseModel):
    email: EmailStr
    password: str


class AuthGoogle(BaseModel):
    id_token: str


class AuthChangePassword(BaseModel):
    current_password: str | None = None
    new_password: str = Field(min_length=6, max_length=128)


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    user: UserRead | None = None
    pending: bool = False


InvoiceStatus = Literal[
    "em_aberto",
    "emitida",
    "enviada",
    "paga",
    "paga_parcial",
    "paga_excedente",
    "cancelada",
]


class HealthPlanBase(BaseModel):
    name: str
    cnpj: str | None = None
    notes: str | None = None


class HealthPlanCreate(HealthPlanBase):
    pass


class HealthPlanUpdate(BaseModel):
    name: str | None = None
    cnpj: str | None = None
    notes: str | None = None


class HealthPlanRead(HealthPlanBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SpecialtyBase(BaseModel):
    name: str


class SpecialtyCreate(SpecialtyBase):
    pass


class SpecialtyUpdate(BaseModel):
    name: str | None = None
    display_order: int | None = None


class SpecialtyRead(SpecialtyBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_order: int = 999


class SpecialtyReorder(BaseModel):
    ids: list[int]


class SpecialtyPriceBase(BaseModel):
    specialty_id: int
    health_plan_id: int
    value: float = Field(ge=0)
    therapy_code: str | None = None


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


class HolidayBase(BaseModel):
    date: date_type
    description: str | None = None


class HolidayCreate(HolidayBase):
    pass


class HolidayRead(HolidayBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


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


PayerType = Literal["health_plan", "patient", "other"]


class ReceiptBase(BaseModel):
    payment_date: date_type
    value: float = Field(ge=0)
    payer_type: PayerType
    payer_health_plan_id: int | None = None
    payer_patient_id: int | None = None
    payer_name: str
    linked_status: InvoiceStatus | None = None
    notes: str | None = None


class ReceiptCreate(ReceiptBase):
    invoice_ids: list[int] = []


class ReceiptUpdate(BaseModel):
    payment_date: date_type | None = None
    value: float | None = Field(default=None, ge=0)
    payer_type: PayerType | None = None
    payer_health_plan_id: int | None = None
    payer_patient_id: int | None = None
    payer_name: str | None = None
    linked_status: InvoiceStatus | None = None
    notes: str | None = None
    invoice_ids: list[int] | None = None


class ReceiptInvoiceSummary(BaseModel):
    id: int
    number: str | None = None
    issue_date: date_type
    patient_name: str
    health_plan_name: str | None = None
    reference_year: int
    reference_month: int
    gross_value: float
    net_value: float
    status: InvoiceStatus


class ReceiptRead(ReceiptBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime_type
    invoices: list[ReceiptInvoiceSummary] = []


class InvoiceSubsetSuggestion(BaseModel):
    invoice_ids: list[int]
    sum_gross: float
    sum_net: float
    diff_gross: float
    diff_net: float


class InvoiceSuggestionsResponse(BaseModel):
    candidates: list[ReceiptInvoiceSummary]
    suggestions: list[InvoiceSubsetSuggestion]
