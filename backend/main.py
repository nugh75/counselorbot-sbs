from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
from typing import List

from . import models, schemas, auth, database

# Create Database Tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "https://counselorbot-sbs.ai4educ.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Semantic Dependencies
get_db = database.get_db

@app.on_event("startup")
def startup_event():
    # Create initial admin user if not exists
    db = database.SessionLocal()
    user = db.query(models.User).filter(models.User.username == "admin").first()
    if not user:
        hashed_password = auth.get_password_hash("admin123")
        db_user = models.User(username="admin", hashed_password=hashed_password, is_admin=True)
        db.add(db_user)
        db.commit()
    db.close()

# --- Auth Endpoints ---

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.post("/register", response_model=schemas.User)
async def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Admin Endpoints ---

@app.get("/admin/logs", response_model=List[schemas.LogResponse])
async def read_logs(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).offset(skip).limit(limit).all()
    return logs

@app.get("/admin/config", response_model=List[schemas.ConfigResponse])
async def read_config(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    configs = db.query(models.Config).all()
    return configs

@app.post("/admin/config", response_model=schemas.ConfigResponse)
async def create_or_update_config(config: schemas.ConfigCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_config = db.query(models.Config).filter(models.Config.key == config.key).first()
    if db_config:
        db_config.value = config.value
        db_config.description = config.description
    else:
        db_config = models.Config(key=config.key, value=config.value, description=config.description)
        db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

# --- Survey Endpoints ---

@app.post("/survey", response_model=schemas.SurveyResponseSchema)
async def submit_survey(survey: schemas.SurveyCreate, db: Session = Depends(get_db)):
    """Submit an anonymous survey response (public endpoint)"""
    db_survey = models.SurveyResponse(**survey.model_dump())
    db.add(db_survey)
    db.commit()
    db.refresh(db_survey)
    return db_survey

@app.get("/admin/surveys", response_model=List[schemas.SurveyResponseSchema])
async def get_surveys(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Get all survey responses (admin only)"""
    surveys = db.query(models.SurveyResponse).order_by(models.SurveyResponse.submitted_at.desc()).offset(skip).limit(limit).all()
    return surveys
    
@app.delete("/admin/survey/{survey_id}")
async def delete_survey(survey_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Delete a survey response (admin only)"""
    survey = db.query(models.SurveyResponse).filter(models.SurveyResponse.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    db.delete(survey)
    db.commit()
    return {"status": "success", "message": "Survey deleted"}

# --- Chat / QSA Endpoints ---

from .ai_service import AIService
import uuid

class ChatRequest(schemas.BaseModel):
    message: str
    mode: str = "generic"
    session_id: str = None
    scores_context: str = ""  # Formatted QSA scores from frontend

@app.post("/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    session_id = request.session_id or str(uuid.uuid4())
    
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)
    
    # Map mode to config key for prompt
    mode_to_prompt = {
        "factor": "prompt_factor",
        "second-level": "prompt_second_level",
        "generic": "prompt_generic",
    }
    prompt_key = mode_to_prompt.get(request.mode, "prompt_generic")
    
    default_prompt = "Sei CounselorBot, un assistente esperto nell'analisi del Questionario sulle Strategie di Apprendimento (QSA). Rispondi sempre in italiano in modo chiaro e professionale."
    system_prompt = ai_service.config.get(prompt_key, default_prompt)
    
    # 2. Build the full message including student's QSA profile
    if request.scores_context:
        full_message = f"{request.scores_context}\n\nDOMANDA DELLO STUDENTE:\n{request.message}"
    else:
        full_message = request.message
    
    # 3. Get AI Response
    response_content = ai_service.get_response(full_message, system_prompt, request.mode)
    
    # 3. Log Interaction
    log_entry = models.Log(
        session_id=session_id,
        action="chat_message",
        details={
            "mode": request.mode, 
            "user_input": request.message, 
            "bot_response": response_content,
            "provider": ai_service.config.get('active_provider', 'unknown'),
            "model": ai_service.config.get('model_name', 'unknown')
        }
    )
    db.add(log_entry)
    db.commit()
    
    return {"response": response_content, "session_id": session_id}

@app.post("/chat/message")
async def chat_message(message: str, session_id: str, mode: str, db: Session = Depends(get_db)):
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)
    
    # Map mode to config key for prompt
    prompt_key = "prompt_generic"
    if mode == "factor": prompt_key = "prompt_factor"
    elif mode == "second-level": prompt_key = "prompt_second_level"
    
    system_prompt = ai_service.config.get(prompt_key, "You are a helpful counselor.")
    
    # 2. Get AI Response
    response_content = ai_service.get_response(message, system_prompt, mode)
    
    # 3. Log Interaction
    log_entry = models.Log(
        session_id=session_id,
        action="chat_message",
        details={
            "mode": mode, 
            "user_input": message, 
            "bot_response": response_content,
            "provider": ai_service.config.get('active_provider', 'unknown'),
            "model": ai_service.config.get('model_name', 'unknown')
        }
    )
    db.add(log_entry)
    db.commit()
    
    return {"response": response_content}

class QsaAuditRequest(schemas.BaseModel):
    scores: dict
    session_id: str

@app.post("/qsa/audit")
async def audit_qsa(request: QsaAuditRequest, db: Session = Depends(get_db)):
    # Log QSA Completion
    log_entry = models.Log(
        session_id=request.session_id,
        action="qsa_completed",
        details={"scores": request.scores}
    )
    db.add(log_entry)
    db.add(log_entry)
    db.commit()
    return {"status": "ok"}

# --- Vision / Upload Endpoints ---
from fastapi import UploadFile, File
import shutil
import subprocess
import json
import os
import sys

@app.post("/qsa/upload")
async def upload_qsa_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 1. Save file temporarily
    temp_dir = ".tmp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"upload_{uuid.uuid4()}_{file.filename}")
    
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # 2. Call execution script
        # Using python subprocess to call the script we defined in directives
        script_path = "execution/extract_qsa_vision.py"
        
        # Ensure script exists
        if not os.path.exists(script_path):
             raise HTTPException(status_code=500, detail="Extraction script not found")
        
        result = subprocess.run(
            [sys.executable, script_path, temp_file_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
             print(f"Script Error: {result.stderr}")
             raise HTTPException(status_code=500, detail="Failed to process image")
             
        # 3. Parse result
        try:
            extraction_data = json.loads(result.stdout)
            if "error" in extraction_data:
                 raise HTTPException(status_code=400, detail=extraction_data["error"])
            return extraction_data
        except json.JSONDecodeError:
             print(f"JSON Error: {result.stdout}")
             raise HTTPException(status_code=500, detail="Invalid response from AI extractor")
             
    finally:
        # 4. Clean up
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


# Text-to-Speech Endpoint using edge-tts
import edge_tts
import asyncio
import io
from fastapi.responses import StreamingResponse
import re

class TTSRequest(schemas.BaseModel):
    text: str
    voice: str = "it-IT-IsabellaNeural"  # Italian female voice

def strip_markdown(text: str) -> str:
    """Remove markdown formatting for cleaner TTS"""
    # Remove headers
    text = re.sub(r'#{1,6}\s*', '', text)
    # Remove bold/italic
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    # Remove horizontal rules
    text = re.sub(r'---+', '', text)
    # Remove bullet points
    text = re.sub(r'^[\-\*]\s*', '', text, flags=re.MULTILINE)
    # Remove extra whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    try:
        clean_text = strip_markdown(request.text)
        
        # Limit text length for safety
        if len(clean_text) > 5000:
            clean_text = clean_text[:5000] + "... Testo troncato."
        
        communicate = edge_tts.Communicate(clean_text, request.voice)
        
        # Collect audio bytes
        audio_bytes = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes.write(chunk["data"])
        
        audio_bytes.seek(0)
        
        return StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Error: {str(e)}")
