"""Connection scaffold only. No schema, queries, or session writes."""
import os
import sqlite3
from pathlib import Path
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "data" / "questions.sqlite3")))
def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DATABASE_PATH)
def initialize_database() -> None:
    # TODO: implement real logic: create curated question/test-case schema later.
    with connect():
        pass
