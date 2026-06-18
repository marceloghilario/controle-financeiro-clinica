"""Shared fixtures for backend tests."""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app import models

TEST_DATABASE_URL = "sqlite:///./test_clinica.db"


@pytest.fixture(autouse=True)
def test_db():
    """Create a fresh in-memory database for each test."""
    engine = create_engine(
        TEST_DATABASE_URL, connect_args={"check_same_thread": False}
    )
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Seed admin user for auth
    db = TestSession()
    admin = models.User(
        email="admin@test.com",
        name="Admin Test",
        role="admin",
        status="active",
        password_hash=hash_password("test123"),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    db.close()

    yield {"engine": engine, "session_factory": TestSession, "admin_id": admin.id}

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    import os
    try:
        os.remove("test_clinica.db")
    except FileNotFoundError:
        pass


@pytest.fixture()
def auth_headers(test_db):
    """Return Authorization headers with a valid JWT for the seeded admin."""
    token = create_access_token(test_db["admin_id"])
    return {"Authorization": f"Bearer {token}"}
