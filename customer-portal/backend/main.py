import os
import uuid
from pathlib import Path

import aiofiles
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
from auth import create_access_token, get_current_user, hash_password, verify_password
from database import Base, engine, get_db
from models import Document, User
from schemas import DocumentResponse, Token, UserCreate, UserResponse

# Create tables
Base.metadata.create_all(bind=engine)

# Ensure uploads directory exists
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Customer Portal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:3000",  # Alternate dev port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["auth"])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    new_user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@app.post("/auth/login", response_model=Token, tags=["auth"])
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Login endpoint that returns a JWT token.
    OAuth2PasswordRequestForm expects 'username' (which we use as email) and 'password'.
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/auth/me", response_model=UserResponse, tags=["auth"])
def get_me(current_user: User = Depends(get_current_user)):
    """A protected route example that returns the current logged-in user."""
    return current_user


@app.post("/documents/upload", response_model=DocumentResponse, tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a document. Validates file extension and size (max 10MB).
    Stores the file with a UUID and records metadata in the database.
    """
    # 1. Check file extension
    allowed_extensions = {".pdf", ".jpg", ".png", ".docx"}
    extension = Path(file.filename).suffix.lower()
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(sorted(allowed_extensions))}"
        )

    # 2. Check file size (Read into memory to check size)
    contents = await file.read()
    file_size = len(contents)
    max_size = 10 * 1024 * 1024  # 10MB
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 10MB limit"
        )

    # 3. Generate stored name
    stored_name = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / stored_name

    # 4. Write to disk
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(contents)

    # 5. Save to database
    db_document = Document(
        user_id=current_user.id,
        original_filename=file.filename,
        stored_filename=stored_name,
        file_size=file_size,
        file_type=extension
    )
    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    return db_document


@app.get("/documents/", response_model=List[DocumentResponse], tags=["documents"])
def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all documents owned by the current user."""
    return db.query(Document).filter(Document.user_id == current_user.id).all()


@app.get("/documents/{document_id}/download", tags=["documents"])
def download_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Download a document.
    Ensures the document exists and belongs to the current user.
    """
    # Ownership and existence check in DB
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Physical file existence check
    file_path = UPLOAD_DIR / document.stored_filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk"
        )

    return FileResponse(
        path=file_path,
        filename=document.original_filename,
        media_type="application/octet-stream"
    )


@app.delete("/documents/{document_id}", tags=["documents"])
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a document.
    Ensures the document belongs to the user before deleting from DB and disk.
    """
    # 1. Ownership and existence check
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document or document.user_id != current_user.id:
        # We return 404 even if it exists but is owned by someone else
        # to prevent leaking the existence of other users' files.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # 2. Delete from DB first
    stored_filename = document.stored_filename
    db.delete(document)
    db.commit()

    # 3. Delete from disk
    file_path = UPLOAD_DIR / stored_filename
    try:
        if file_path.exists():
            os.remove(file_path)
    except Exception:
        # If file removal fails (e.g. file already gone), we continue silently
        # since the DB record is already successfully removed.
        pass

    return {"message": "File deleted successfully"}

