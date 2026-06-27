import json
import os
import re
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, String, Text

# Define the DB schema to connect from host
Base = declarative_base()

class Config(Base):
    __tablename__ = 'configs'
    key = Column(String(255), primary_key=True)
    value = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(here, "live_prompts_EN.json")
    
    # 1. Read the JSON file
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    configs = data.get("configs", {})
    
    # 2. Perform replacements to make prompts language-neutral
    replacements = [
        ("Always speak in simple, direct and encouraging English", "Always speak in a simple, direct and encouraging tone, in the requested language"),
        ("Reply in a FOCUSED, conversational and concise way, in English.", "Reply in a FOCUSED, conversational and concise way, in the requested language."),
        ("Reply in simple, practical and encouraging English.", "Reply in a simple, practical and encouraging tone, in the requested language."),
        ("Speak in clear, practical and personalised English", "Speak in a clear, practical and personalised tone, in the requested language"),
        ("Always speak in simple, direct and encouraging English", "Always speak in a simple, direct and encouraging tone, in the requested language"),
        ("Produce the final summary of the path in English", "Produce the final summary of the path in the requested language"),
        ("proposing practical guidance in English.", "proposing practical guidance in the requested language."),
        ("Reply in English", "Reply in the requested language"),
        ("Produce the final summary of the interview in English", "Produce the final summary of the interview in the requested language"),
        ("Speak in clear, concrete and encouraging English", "Speak in a clear, concrete and encouraging tone, in the requested language"),
        ("Use an empathetic and constructive tone, in English.", "Use an empathetic and constructive tone, in the requested language."),
    ]
    
    updated_count = 0
    for key, val in configs.items():
        new_val = val
        for old_str, new_str in replacements:
            if old_str in new_val:
                new_val = new_val.replace(old_str, new_str)
                
        # Additional cleanup for any remaining lowercase "in English" if any
        if "in English" in new_val:
            new_val = new_val.replace("in English", "in the requested language")
            
        if new_val != val:
            configs[key] = new_val
            updated_count += 1
            print(f"Patched key: {key}")
            
    # Write back the patched JSON file
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    print(f"Saved patched JSON with {updated_count} modifications.")
    
    # 3. Connect to database and update configs
    # Read DB credentials from .env in parent folder
    parent_dir = os.path.dirname(here)
    env_path = os.path.join(parent_dir, ".env")
    env = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    env[k.strip()] = v.strip().strip("'").strip('"')
                    
    db_user = env.get("POSTGRES_USER", "counselorbot_user")
    db_pass = env.get("POSTGRES_PASSWORD", "xOZ3DO0zbOC0_ujw4ZDD0ok5fuNP-xaIVRXFXCuNoX4")
    db_name = env.get("POSTGRES_DB", "counselorbot")
    db_port = env.get("POSTGRES_HOST_PORT", "5435")
    db_host = env.get("POSTGRES_HOST", "localhost")
    
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    print(f"Connecting to database at {db_host}:{db_port}...")
    
    try:
        engine = create_engine(db_url)
        Session = sessionmaker(bind=engine)
        session = Session()
        
        db_updated = 0
        for key, en_val in configs.items():
            cfg = session.query(Config).filter(Config.key == key).first()
            if cfg:
                # Normalize spaces to compare
                cur_norm = re.sub(r"\s+", " ", cfg.value or "").strip()
                en_norm = re.sub(r"\s+", " ", en_val).strip()
                if cur_norm != en_norm:
                    cfg.value = en_val
                    db_updated += 1
                    print(f"Updated config {key} in DB")
                    
        session.commit()
        print(f"Database update complete. Updated {db_updated} keys.")
        session.close()
    except Exception as e:
        print(f"Database connection failed: {e}")

if __name__ == '__main__':
    main()
