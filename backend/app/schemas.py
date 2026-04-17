from pydantic import BaseModel, ConfigDict, Field


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
    health_plan_id: int
    active: int = 1


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    name: str | None = None
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


class MonthlyAbsenceBase(BaseModel):
    patient_id: int
    specialty_id: int
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    count: int = Field(ge=0)


class MonthlyAbsenceCreate(MonthlyAbsenceBase):
    pass


class MonthlyAbsenceRead(MonthlyAbsenceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class SpecialtyReportItem(BaseModel):
    specialty_id: int
    specialty_name: str
    sessions_planned: int
    absences: int
    sessions_billed: int
    unit_value: float
    total: float


class PatientMonthReport(BaseModel):
    patient_id: int
    patient_name: str
    health_plan_id: int
    health_plan_name: str
    year: int
    month: int
    business_days_by_weekday: dict[int, int]
    items: list[SpecialtyReportItem]
    total: float


class HealthPlanMonthReport(BaseModel):
    health_plan_id: int
    health_plan_name: str
    year: int
    month: int
    patients: list[PatientMonthReport]
    total: float
