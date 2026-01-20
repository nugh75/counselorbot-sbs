import os
from sqlalchemy import create_engine, text
import dotenv
dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")
POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}"

def check_sequences():
    print("Checking sequences...")
    engine = create_engine(POSTGRES_URL)
    with engine.connect() as conn:
        for table in ['logs', 'users', 'survey_responses']:
            # Check max ID
            max_id = conn.execute(text(f"SELECT MAX(id) FROM {table}")).scalar()
            
            # Check sequence last_value (this might require permissions or different query depending on PG version)
            # Standard way since PG 10:
            seq_name = f"{table}_id_seq"
            try:
                seq_val = conn.execute(text(f"SELECT last_value FROM {seq_name}")).scalar()
                print(f"Table {table}: Max ID = {max_id}, Sequence {seq_name} = {seq_val}")
                
                # Try a test insert (rollback afterwards)
                if table == 'logs':
                    print("Attempting test insert into logs...")
                    trans = conn.begin()
                    try:
                        conn.execute(text("INSERT INTO logs (session_id, action, details) VALUES ('test', 'test', '{}')"))
                        print("Test insert SUCCESS.")
                        trans.rollback()
                        print("Test insert rolled back.")
                    except Exception as e:
                        print(f"Test insert FAILED: {e}")
                        trans.rollback()

            except Exception as e:
                print(f"Error checking {table}: {e}")

if __name__ == "__main__":
    check_sequences()
