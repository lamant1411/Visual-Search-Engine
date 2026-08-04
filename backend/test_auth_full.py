import requests
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = "http://localhost:8000/api/v1"
rand_id = random.randint(1000, 9999)
email = f"test_user_{rand_id}@example.com"
password = "Password123!"

print("=== TEST FULL AUTH FLOW ===")
print(f"Email: {email}")

# 1. Register
print("\n--- 1. Register ---")
res = requests.post(f"{BASE_URL}/auth/register", json={"email": email, "password": password})
print(f"Status: {res.status_code}")
print(f"Response: {res.json()}")

# 2. Login
print("\n--- 2. Login (kiem tra co refresh_token) ---")
res2 = requests.post(f"{BASE_URL}/auth/login", data={"username": email, "password": password})
print(f"Status: {res2.status_code}")
if res2.status_code != 200:
    print(res2.text)
    sys.exit(1)

data = res2.json()
access_token = data["access_token"]
refresh_token = data.get("refresh_token")
print(f"access_token : {access_token[:40]}...")
print(f"refresh_token: {str(refresh_token)[:40]}...")

# 3. /me
print("\n--- 3. /me (kiem tra is_active check) ---")
headers = {"Authorization": f"Bearer {access_token}"}
res3 = requests.get(f"{BASE_URL}/auth/me", headers=headers)
print(f"Status: {res3.status_code}")
print(f"User: {res3.json()}")

# 4. /refresh
print("\n--- 4. /refresh (doi token moi) ---")
res4 = requests.post(f"{BASE_URL}/auth/refresh", json={"refresh_token": refresh_token})
print(f"Status: {res4.status_code}")
if res4.status_code == 200:
    new_data = res4.json()
    new_access = new_data["access_token"]
    new_refresh = new_data.get("refresh_token")
    print(f"new access_token : {new_access[:40]}...")
    print(f"new refresh_token: {str(new_refresh)[:40]}...")
else:
    print(res4.text)
    new_access = access_token

# 5. /logout
print("\n--- 5. /logout ---")
res5 = requests.post(f"{BASE_URL}/auth/logout", headers={"Authorization": f"Bearer {new_access}"})
print(f"Status: {res5.status_code}  (204 = thanh cong)")

# 6. Dung old refresh_token sau khi logout
print("\n--- 6. Dung OLD refresh_token sau logout (phai 401) ---")
res6 = requests.post(f"{BASE_URL}/auth/refresh", json={"refresh_token": refresh_token})
print(f"Status: {res6.status_code}  (401 = dung, token da bi thu hoi)")
