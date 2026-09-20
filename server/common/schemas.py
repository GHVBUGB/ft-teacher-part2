from typing import Generic, Literal, TypeVar, Any
from uuid import UUID
from pydantic import BaseModel, Field
T=TypeVar('T')
class Envelope(BaseModel,Generic[T]):
    data:T
    request_id:UUID
class ErrorDetail(BaseModel):
    code:str
    message:str
    retryable:bool
class ErrorEnvelope(BaseModel):
    error:ErrorDetail
    request_id:UUID
class Teacher(BaseModel):
    id:UUID
    external_teacher_id:str
    display_name:str
    locale:str
    timezone:str
class Enrollment(BaseModel):
    id:UUID
    teacher_id:UUID
    course_version_id:UUID
    run_no:int=Field(ge=1)
    lifecycle_state:Literal['active']
class PartProgress(BaseModel):
    part_key:Literal['orientation','practice']
    can_enter:bool
    completion_state:Literal['not_started','in_progress','completed']
    assessment_state:Literal['not_evaluated','passed','failed','needs_review']
    progress_percent:float|None=Field(default=None,ge=0,le=100)
    revision:int=Field(ge=0)
    summary_version:int=Field(ge=1)
    summary:dict[str,Any]
class ProgressResponse(BaseModel):
    enrollment_id:UUID
    course_version_id:UUID
    parts:list[PartProgress]
class ModuleEntry(BaseModel):
    part_key:Literal['orientation','practice']
    path:str
class CourseResponse(BaseModel):
    id:UUID
    code:str
    title:str
    course_version_id:UUID
    version:str
    locale:str
    modules:list[ModuleEntry]
