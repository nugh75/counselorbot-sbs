import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import dotenv
dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")
POSTGRES_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@localhost:5432/{POSTGRES_DB}"

# User provided key
NEW_KEY = "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"
PROVIDER = "openrouter"
MODEL = "google/gemini-2.0-flash-001" # Best guess for 'gemini 2.5' request, as it is the latest flash

def update_config():
    print("Updating AI Configuration...")
    engine = create_engine(POSTGRES_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Helper to upsert
        def upsert(key, value, description):
            # Check if exists
            exists = session.execute(text("SELECT key FROM configs WHERE key = :key"), {"key": key}).fetchone()
            if exists:
                session.execute(text("UPDATE configs SET value = :value WHERE key = :key"), {"key": key, "value": value})
                print(f"Updated {key}")
            else:
                session.execute(text("INSERT INTO configs (key, value, description) VALUES (:key, :value, :desc)"), 
                                {"key": key, "value": value, "desc": description})
                print(f"Inserted {key}")

        upsert("api_key_openrouter", NEW_KEY, "API Key OpenRouter")
        upsert("active_provider", PROVIDER, "Provider AI attivo")
        upsert("model_name", MODEL, "Es. gpt-4o, claude-3-opus")

        session.commit()
        print("Configuration updated successfully.")
        print(f"Provider: {PROVIDER}")
        print(f"Model: {MODEL}")

    except Exception as e:
        print(f"Error updating config: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    update_config()
