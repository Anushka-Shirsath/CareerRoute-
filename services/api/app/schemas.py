from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

Pathway = Literal['fyjc_science', 'fyjc_commerce', 'fyjc_arts', 'polytechnic_diploma', 'iti_trade', 'vocational']
Board = Literal['SSC_MH', 'CBSE', 'ICSE']
Locale = Literal['en', 'mr', 'hi']


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class Subject(Input):
    canonical_subject: Literal['first_language', 'second_language', 'third_language', 'english', 'mathematics', 'science', 'social_science', 'other']
    name_as_shown: str = Field(min_length=1, max_length=100)
    obtained: float | None = Field(default=None, ge=0)
    maximum: float | None = Field(default=None, gt=0)
    grade_label: str | None = Field(default=None, min_length=1, max_length=20)
    source: Literal['extracted', 'extracted_then_corrected', 'typed'] = 'typed'

    @model_validator(mode='after')
    def valid_marks(self):
        if self.obtained is not None and (self.maximum is None or self.obtained > self.maximum):
            raise ValueError('Obtained must be between zero and maximum.')
        if self.obtained is None and not self.grade_label:
            raise ValueError('Enter numeric marks or a grade label.')
        return self


SubjectList = Annotated[list[Subject], Field(min_length=1, max_length=30)]


def unique_subjects(subjects):
    names = [x.name_as_shown.casefold() for x in subjects]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate subject names are not allowed.')
    return subjects


class ManualResult(Input):
    board: Board
    exam_year: int = Field(ge=2000, le=2100)
    result_type: Literal['official', 'provisional', 'manual'] = 'manual'
    subjects: SubjectList

    @model_validator(mode='after')
    def unique(self):
        unique_subjects(self.subjects)
        return self


class DeviceReadResult(Input):
    """Marks read from a marksheet on the student's own device. The file stays there."""
    board: Board
    exam_year: int = Field(ge=2000, le=2100)
    subjects: SubjectList

    @model_validator(mode='after')
    def extracted_and_unique(self):
        if any(s.source != 'extracted' for s in self.subjects):
            raise ValueError('Device-read subjects must be marked as extracted.')
        unique_subjects(self.subjects)
        return self


class ConfirmResult(Input):
    confirm: Literal[True]
    subjects: SubjectList | None = None

    @model_validator(mode='after')
    def unique(self):
        if self.subjects:
            unique_subjects(self.subjects)
        return self


class ProfilePatch(Input):
    display_name: str | None = Field(default=None, max_length=60)
    locale: Locale | None = None
    home_city: str | None = Field(default=None, max_length=80)
    home_district: str | None = Field(default=None, max_length=80)
    target_districts: list[Annotated[str, Field(min_length=1, max_length=80)]] | None = Field(default=None, max_length=5)
    chat_history_enabled: bool | None = None


class Weights(Input):
    academic_fit: float = Field(default=85, ge=0, le=100)
    affordability: float = Field(default=75, ge=0, le=100)
    proximity: float = Field(default=50, ge=0, le=100)
    government: float = Field(default=0, ge=0, le=100)
    hostel: float = Field(default=0, ge=0, le=100)
    medium: float = Field(default=0, ge=0, le=100)


class Preferences(Input):
    pathway: Pathway | None = None
    target_districts: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(default_factory=list, max_length=5)
    tuition_cap_inr: int | None = Field(default=None, ge=0, le=500000)
    cap_is_hard: bool = False
    government: Literal['only', 'preferred', 'any'] = 'any'
    hostel: Literal['required', 'preferred', 'any'] = 'any'
    medium: str | None = Field(default=None, max_length=60)
    medium_required: bool = False
    weights: Weights = Field(default_factory=Weights)


class AdmissionContext(Input):
    admission_system: Literal['FYJC_CAP', 'DTE_POLY_CAP', 'DVET_ITI']
    academic_year: str = Field(pattern=r'^20\d{2}-\d{2}$')
    round: str | None = Field(default=None, max_length=80)
    quota: str | None = Field(default=None, max_length=200)
    merit_metric: str | None = Field(default=None, max_length=80)
    extra_dimensions: dict[str, str] = Field(default_factory=dict, max_length=10)


class MatchRequest(Input):
    preferences: Preferences | None = None
    admission_context: AdmissionContext | None = None
    limit: int = Field(default=20, ge=1, le=50)
    cursor: str | None = Field(default=None, max_length=1000)


class SensitiveInput(Input):
    category_code: str | None = Field(default=None, max_length=80)


class GoalInput(Input):
    pathway_id: Pathway


class StartMission(Input):
    mission_id: Literal['mission1'] = 'mission1'
    locale: Locale = 'en'


class GameEvent(Input):
    node_id: str = Field(max_length=30)
    option_ids: list[Annotated[str, Field(max_length=50)]] = Field(default_factory=list, max_length=10)
    rating: int | None = Field(default=None, ge=1, le=5)
    task_outcome: dict | None = None
    skip: bool = False
    idempotency_key: str = Field(min_length=8, max_length=100)


class CompassReportInput(Input):
    session_id: str | None = Field(default=None, max_length=100)


class Assumptions(Input):
    hostel_monthly: float | None = Field(default=None, ge=0, le=100000)
    food_monthly: float | None = Field(default=None, ge=0, le=100000)
    transport_monthly: float | None = Field(default=None, ge=0, le=100000)
    travel_home_monthly: float | None = Field(default=None, ge=0, le=100000)
    books_supplies: float | None = Field(default=None, ge=0, le=100000)
    months: int = Field(default=10, ge=1, le=12)


class CostCompare(Input):
    offering_ids: list[Annotated[str, Field(max_length=100)]] = Field(min_length=2, max_length=3)
    academic_year: str = Field(pattern=r'^20\d{2}-\d{2}$')
    assumptions: Assumptions = Field(default_factory=Assumptions)
    assumptions_by_offering: dict[str, Assumptions] = Field(default_factory=dict, max_length=3)


class ShortlistInput(Input):
    status: Literal['interested', 'shortlisted', 'preparing_documents', 'applied_reported', 'allotted_reported', 'admitted_reported', 'not_selected_reported', 'withdrawn'] = 'interested'
    note: str | None = Field(default=None, max_length=1000)


class ChecklistInput(Input):
    done: bool


class MentorInput(Input):
    message: str = Field(min_length=1, max_length=1000)
    provider_consent: StrictBool = False
    locale: Locale | None = None
    page_path: str | None = Field(default=None, max_length=300)
    confirm_preference_change_id: str | None = Field(default=None, max_length=100)


class ParentReportInput(Input):
    sections: list[Literal['academic_summary', 'compass_summary', 'routes_and_alternatives', 'shortlist', 'costs', 'next_steps', 'questions_to_discuss', 'category_used_in_comparison']] = Field(min_length=1, max_length=8)
    locale_default: Locale = 'en'
    expires_in_days: int = Field(default=7, ge=1, le=30)


class UploadRequest(Input):
    mime: Literal['application/pdf', 'image/png', 'image/jpeg']
    size: int = Field(ge=1, le=5 * 1024 * 1024)


class ExtractRequest(Input):
    document_id: str = Field(max_length=100)
    board: Board
    exam_year: int = Field(ge=2000, le=2100)
