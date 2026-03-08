from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.orm import Session

import models  # Ensures ORM classes register on Base.metadata before create_all runs
from auth import hash_password
from database import Base, engine, get_db
from models import User
from schemas import UserCreate, UserResponse

# Create all tables in the database on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Customer Portal API")


@app.get("/")
def root():
    return {"status": "running"}


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, tags=["auth"])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Register a new user. Returns the created user without the hashed password."""
    # Check if email is already taken
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create and persist the new user
    new_user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user
