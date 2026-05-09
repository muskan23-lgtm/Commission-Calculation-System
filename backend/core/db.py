from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///commission.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
Base = declarative_base()

@contextmanager
def session_scope():
    """Provide a transactional scope that always closes the session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    # Import models to register them with Base.metadata
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Lightweight schema evolution for SQLite deployments
    with engine.begin() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(sales)"))}
        if "hierarchy_snapshot" not in cols:
            conn.execute(text("ALTER TABLE sales ADD COLUMN hierarchy_snapshot TEXT"))

        cb_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(clawback_items)"))}
        if "meta" not in cb_cols:
            conn.execute(text("ALTER TABLE clawback_items ADD COLUMN meta TEXT"))
