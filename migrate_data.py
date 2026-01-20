import os
import sys
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

# Add backend to path so we can import models
sys.path.append(os.path.join(os.getcwd(), "backend"))

from backend.models import Base

# Database configurations
SQLITE_URL = "sqlite:///./counselorbot.db"

import dotenv
dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB")

# Construct localhost URL for running this script from host
POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}"

def migrate():
    print("Connecting to databases...")
    sqlite_engine = create_engine(SQLITE_URL)
    postgres_engine = create_engine(POSTGRES_URL)

    # Verify SQLite exists
    if not os.path.exists("./counselorbot.db"):
        print("Error: counselorbot.db not found.")
        return

    # Create tables in Postgres
    print("Creating tables in PostgreSQL...")
    Base.metadata.create_all(bind=postgres_engine)

    # Sessions
    SqliteSession = sessionmaker(bind=sqlite_engine)
    PostgresSession = sessionmaker(bind=postgres_engine)

    sqlite_session = SqliteSession()
    postgres_session = PostgresSession()

    inspector = inspect(sqlite_engine)
    table_names = inspector.get_table_names()

    try:
        for table_name in table_names:
            print(f"Migrating table: {table_name}")
            
            rows = sqlite_session.execute(text(f"SELECT * FROM {table_name}")).fetchall()
            if not rows:
                print(f"  - No data in {table_name}")
                continue
            
            print(f"  - Found {len(rows)} rows")
            
            # Get column names
            columns = [column['name'] for column in inspector.get_columns(table_name)]
            
            # Insert into postgres
            data_to_insert = [dict(zip(columns, row)) for row in rows]
            
            # We use core insert to bypass potential ORM overhead/mismatches slightly
            from sqlalchemy import Table, MetaData
            meta = MetaData()
            pg_table = Table(table_name, meta, autoload_with=postgres_engine)
            
            with postgres_engine.begin() as conn:
                conn.execute(pg_table.insert(), data_to_insert)
            
            print(f"  - Successfully moved {len(data_to_insert)} rows to {table_name}")

        print("Migration completed successfully!")

    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        sqlite_session.close()
        postgres_session.close()

if __name__ == "__main__":
    migrate()
