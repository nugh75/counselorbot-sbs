import json
import sys

try:
    with open('openrouter_models.json', 'r') as f:
        data = json.load(f)
        
    models = data.get('data', [])
    
    # Filter for interesting models
    keywords = ['gpt-4', 'claude-3', 'gemini', 'llama-3', 'mistral', 'deepseek']
    
    found = []
    for m in models:
        mid = m['id']
        name = m['name']
        if any(k in mid.lower() for k in keywords):
            print(f"{mid}")

except Exception as e:
    print(f"Error: {e}")
