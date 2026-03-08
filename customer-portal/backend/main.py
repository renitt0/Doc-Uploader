from fastapi import FastAPI

import models  # Ensures ORM classes register on Base.metadata before create_all runs
from database import Base, engine

# Create all tables in the database on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Customer Portal API")


@app.get("/")
def root():
    return {"status": "running"}
