import os
from sqlalchemy import create_engine, text
import dotenv
dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")
POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}"

def force_reset():
    print("Force resetting sequences...")
    engine = create_engine(POSTGRES_URL)
    with engine.connect() as conn:
        # Find the correct sequence name for logs.id
        seq_name = conn.execute(text("SELECT pg_get_serial_sequence('logs', 'id')")).scalar()
        print(f"Sequence for logs.id is: {seq_name}")
        
        if seq_name:
            # Force set to 10000
            conn.execute(text(f"SELECT setval('{seq_name}', 10000)"))
            print(f"Forced {seq_name} to 10000")
            
            # Verify
            next_val = conn.execute(text(f"SELECT nextval('{seq_name}')")).scalar()
            print(f"Next value will be: {next_val}")
        else:
            print("Could not find sequence for logs.id")
            
        conn.commit()

if __name__ == "__main__":
    force_reset()
