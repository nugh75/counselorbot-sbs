import os
import sys
from sqlalchemy import create_engine, text

# Database configurations
import dotenv
dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")

# Construct localhost URL for running this script from host
# Assuming we are running this from the host machine and port 5432 is mapped
POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}"

def reset_sequences():
    print("Connecting to PostgreSQL...")
    engine = create_engine(POSTGRES_URL)

    with engine.connect() as conn:
        # Tables with auto-incrementing integer IDs
        tables = ['logs', 'users', 'survey_responses']
        
        for table in tables:
            print(f"Resetting sequence for table: {table}")
            try:
                # Get max id
                result = conn.execute(text(f"SELECT MAX(id) FROM {table}"))
                max_id = result.scalar()
                
                if max_id is None:
                    max_id = 0
                
                print(f"  - Max ID is {max_id}")
                
                # Reset sequence
                # The sequence name is usually table_id_seq by default in Postgres
                seq_name = f"{table}_id_seq"
                
                # Update sequence
                # setval sets the current value, nextval will be max_id + 1
                conn.execute(text(f"SELECT setval('{seq_name}', {max_id})"))
                print(f"  - Sequence {seq_name} reset to {max_id}")
                
            except Exception as e:
                print(f"  - Error resetting {table}: {e}")

        conn.commit()
    print("Done!")

if __name__ == "__main__":
    reset_sequences()
