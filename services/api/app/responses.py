"""Typed public contract for frontend integration; no frontend pages are built."""
from typing import Any, Generic, Literal, TypeVar
from pydantic import BaseModel, ConfigDict, Field
from .schemas import Board, Pathway, Subject

T = TypeVar('T')


class Output(BaseModel):
    model_config = ConfigDict(extra='allow')


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: list[dict[str, str]]


class ErrorEnvelope(BaseModel):
    error: ErrorBody
    request_id: str


class Envelope(BaseModel, Generic[T]):
    data: T
    warnings: list[str] = Field(default_factory=list)
    request_id: str


class Aggregate(Output):
    value: float | None
    method: str
    label: str
    merit_metric: str | None = None


class SubjectPercentage(Subject):
    percentage: float | None


class AcademicSummary(Output):
    board: Board | None = None
    exam_year: int | None = None
    result_type: str | None = None
    is_synthetic: bool
    subjects: list[SubjectPercentage]
    aggregate: Aggregate
    strengths: list[str]
    observations: list[str]
    routes_kept_open: list[Pathway]


class ResultView(Output):
    result_id: str
    board: Board
    exam_year: int
    result_type: Literal['official', 'provisional', 'manual']
    confirmation_state: Literal['draft', 'confirmed', 'superseded']
    extraction_method: Literal['manual', 'pdf_text', 'image_vision']
    revision: int
    subjects: list[Subject]
    is_synthetic: bool
    aggregate: Aggregate | None = None


class Fact(Output):
    value: str | float | int | bool | None
    status: Literal['official_source', 'institution_source', 'student_reported', 'estimate', 'unknown', 'demo']
    source_id: str | None
    academic_year: str | None
    unit: str | None = None


class OfferingFacts(Output):
    id: str
    institution_id: str
    name: str
    district: str | None
    city: str | None
    management: str
    pathway_id: Pathway
    academic_year: str | None
    program_name: str
    medium: str | None
    intake: int | None
    hostel_status: Literal['available', 'not_available', 'unknown']
    tuition: float | None
    source_id: str | None
    is_synthetic: bool
    verified_fields: dict[str, Fact]


class CutoffComparison(Output):
    status: Literal['comparable', 'not_comparable', 'no_cutoff_record']
    reason: Literal['CATEGORY_NOT_PROVIDED', 'QUOTA_MISMATCH', 'ROUND_NOT_SELECTED', 'METRIC_MISMATCH', 'AGGREGATE_RULE_UNVERIFIED', 'RESULT_NOT_CONFIRMED', 'YEAR_NOT_AVAILABLE'] | None = None
    record: dict[str, Any] | None = None


class Component(Output):
    criterion: str
    weight: float
    value: float | None


class RankedOffering(Output):
    offering_id: str
    name: str
    pathway_id: Pathway
    eligibility_status: Literal['eligible_by_known_rules', 'not_eligible', 'needs_more_info', 'rules_not_verified']
    cutoff_comparison: CutoffComparison
    utility: float | None
    evidence_coverage: float
    components: list[Component]
    unrated_criteria: list[str]
    ranker_version: str
    weights: dict[str, float]
    facts: OfferingFacts


class MatchOutput(Output):
    results: list[RankedOffering]
    groups: dict[str, list[RankedOffering]]
    total: int
    next_cursor: str | None
    ranker_version: str
    weights: dict[str, float]
    relaxation_hints: list[str]


class Readiness(Output):
    band: Literal['strong', 'moderate', 'limited', 'not_available']
    subjects: list[str]
    average: float | None


class Route(Output):
    pathway_id: Pathway
    score: float | None
    readiness: Readiness
    why: list[dict[str, str]]
    limited_evidence: bool
    close_call: bool


class CompassReport(Output):
    report_id: str
    ruleset: str
    generated_at: str
    mode: Literal['game_and_marks', 'marks_only', 'game_only']
    coverage: Literal['early', 'developing', 'good']
    top_routes: list[Route]
    alternatives: list[Pathway]
    student_override: Pathway | None
    ranked: bool
    footer: str


class MentorReply(Output):
    reply: str
    used_tools: list[str]
    sources: list[str]
    memory_suggestions: list[dict[str, Any]]
    fallback: bool
