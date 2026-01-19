
import requests
import sys

BASE_URL = "http://localhost:8000"

def login(username, password):
    try:
        response = requests.post(
            f"{BASE_URL}/token",
            data={"username": username, "password": password}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        return None
    except Exception as e:
        print(f"Error connecting to server: {e}")
        return None

def test_admin_access(token):
    headers = {"Authorization": f"Bearer {token}"}
    
    endpoints = [
        "/admin/config",
        "/admin/logs",
        "/admin/surveys"
    ]
    
    for endpoint in endpoints:
        print(f"Testing {endpoint}...")
        response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print(f"Data count: {len(response.json())}")
        else:
            print(f"Error: {response.text}")
        print("-" * 20)

def main():
    print("1. Testing with INVALID credentials...")
    token = login("wrong", "user")
    if token:
        print("Logged in unexpectedly!")
    else:
        print("Login failed as expected.")
        
    print("\n2. Testing with VALID Admin credentials (admin/admin123)...")
    # Assuming default admin credentials
    token = login("admin", "admin123")
    
    if token:
        print("Login successful. Accessing admin endpoints:")
        test_admin_access(token)
    else:
        print("Could not log in as admin. Check server logs or database.")

if __name__ == "__main__":
    main()
