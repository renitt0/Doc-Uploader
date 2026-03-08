from datetime import datetime

from pydantic import BaseModel


# ── User Schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Document Schemas ──────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: int
    original_filename: str
    file_size: int
    file_type: str
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ── Auth Schemas ──────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
