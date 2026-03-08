from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


# ── User Schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one digit")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class UserResponse(BaseModel):
    id: int
    email: EmailStr
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
