import os
import sys
import json
import time
from dotenv import load_dotenv

load_dotenv()

# Build postgres URL for local usage if not set
if not os.getenv("DATABASE_URL"):
    user = os.getenv("POSTGRES_USER", "counselorbot_user")
    pwd = os.getenv("POSTGRES_PASSWORD", "xOZ3DO0zbOC0_ujw4ZDD0ok5fuNP-xaIVRXFXCuNoX4")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_HOST_PORT", "5435")
    db = os.getenv("POSTGRES_DB", "counselorbot")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{pwd}@{host}:{port}/{db}"

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openai import OpenAI
from backend.database import SessionLocal
from backend import models
from backend.guided_step_questions_seed import DEFAULT_GUIDED_STEP_QUESTIONS
from backend.assistant_questions_seed import DEFAULT_ASSISTANT_QUESTIONS

# Supported languages (excluding IT, which is the source)
LANGUAGES = ["en", "es", "fr", "de", "sv"]
LANG_NAMES = {
    "en": "English",
    "es": "Spanish (Español)",
    "fr": "French (Français)",
    "de": "German (Deutsch)",
    "sv": "Swedish (Svenska)"
}

openrouter_key = os.getenv("OPENROUTER_API_KEY")
if not openrouter_key:
    print("Error: OPENROUTER_API_KEY not found in env.")
    sys.exit(1)

# Initialize OpenAI client pointing to OpenRouter
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=openrouter_key
)

def translate_list(texts: list[str], target_lang: str) -> list[str]:
    if not texts:
        return []
    
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    prompt = (
        f"You are a professional translator. Translate the following list of educational, counseling and learning-strategy question cards from Italian to {lang_name}.\n"
        f"Maintain the exact tone (supportive, reflective, formal/educational), style, and meaning.\n"
        f"Make sure to translate the question format correctly (retaining question marks and meaning).\n"
        f"Return the translations as a JSON object containing a single key 'translated_texts' which points to a JSON array of strings in the exact same order.\n"
        f"Do not include any extra introductory text or markdown formatting outside of valid JSON.\n\n"
        f"Input list:\n" + "\n".join(f"- {t}" for t in texts)
    )

    try:
        response = client.chat.completions.create(
            model="google/gemini-3.1-flash-lite",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        translated = data.get("translated_texts", [])
        if not translated:
            # Fallback if model used different key name
            for val in data.values():
                if isinstance(val, list):
                    translated = val
                    break
        
        if len(translated) != len(texts):
            print(f"Warning: size mismatch (expected {len(texts)}, got {len(translated)}). Retrying...")
            return translate_list(texts, target_lang)
        return [t.strip() for t in translated]
    except Exception as e:
        print(f"Error translating list: {e}. Sleeping 5 seconds and retrying...")
        time.sleep(5)
        return translate_list(texts, target_lang)

def main():
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "backend",
        "translations_seed.json"
    )
    
    # Load existing translations if file exists
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    else:
        data = {}
        
    if "guided_step_questions" not in data:
        data["guided_step_questions"] = {}
    if "assistant_questions" not in data:
        data["assistant_questions"] = {}

    # 1. Translate Guided Step Questions
    print("--- Translating Guided Step Questions ---")
    for q_type, steps in DEFAULT_GUIDED_STEP_QUESTIONS.items():
        if q_type not in data["guided_step_questions"]:
            data["guided_step_questions"][q_type] = {}
        for step_id, questions in steps.items():
            if step_id not in data["guided_step_questions"][q_type]:
                data["guided_step_questions"][q_type][step_id] = {}
            
            for lang in LANGUAGES:
                if lang in data["guided_step_questions"][q_type][step_id]:
                    # Already translated
                    continue
                print(f"Translating Guided Step: {q_type} / {step_id} to {lang}...")
                translated = translate_list(questions, lang)
                data["guided_step_questions"][q_type][step_id][lang] = translated
                
                # Save progressively
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                time.sleep(1.0) # Small delay to be polite

    # 2. Translate Assistant Questions
    print("--- Translating Assistant Questions ---")
    for topic, questions in DEFAULT_ASSISTANT_QUESTIONS.items():
        if topic not in data["assistant_questions"]:
            data["assistant_questions"][topic] = {}
        
        for lang in LANGUAGES:
            if lang in data["assistant_questions"][topic]:
                # Already translated
                continue
            print(f"Translating Assistant Questions for topic: {topic} to {lang}...")
            # Translate in chunks of 10 to be safe and accurate
            chunk1 = questions[:10]
            chunk2 = questions[10:]
            
            trans1 = translate_list(chunk1, lang)
            time.sleep(1.0)
            trans2 = translate_list(chunk2, lang)
            
            data["assistant_questions"][topic][lang] = trans1 + trans2
            
            # Save progressively
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            time.sleep(1.0)

    print("Translation complete! Saved to:", output_path)

    # 3. Seed into Database
    print("--- Seeding into database ---")
    db = SessionLocal()
    try:
        # Guided Step Questions
        for q_type, steps in data["guided_step_questions"].items():
            for step_id, lang_dict in steps.items():
                for lang, questions in lang_dict.items():
                    # check if already exists
                    existing = (
                        db.query(models.GuidedStepQuestion)
                        .filter(
                            models.GuidedStepQuestion.questionnaire_type == q_type,
                            models.GuidedStepQuestion.step_id == step_id,
                            models.GuidedStepQuestion.language == lang
                        )
                        .all()
                    )
                    if existing:
                        continue
                    
                    print(f"Seeding Guided Step Questions: {q_type} / {step_id} / {lang}...")
                    for idx, q_text in enumerate(questions):
                        db.add(
                            models.GuidedStepQuestion(
                                questionnaire_type=q_type,
                                step_id=step_id,
                                language=lang,
                                text=q_text,
                                sort_order=idx,
                                is_active=True
                            )
                        )
        
        # Assistant Questions
        for topic, lang_dict in data["assistant_questions"].items():
            for lang, questions in lang_dict.items():
                # check if already exists
                existing = (
                    db.query(models.AssistantQuestion)
                    .filter(
                        models.AssistantQuestion.topic == topic,
                        models.AssistantQuestion.language == lang
                    )
                    .all()
                )
                if existing:
                    continue
                
                print(f"Seeding Assistant Questions: {topic} / {lang}...")
                for idx, q_text in enumerate(questions):
                    db.add(
                        models.AssistantQuestion(
                            topic=topic,
                            language=lang,
                            text=q_text,
                            sort_order=idx,
                            is_active=True
                        )
                    )
        
        db.commit()
        print("Database seeding from translations complete!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
