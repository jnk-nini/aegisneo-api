"""Deploy firestore.rules (deny all client access) through the Firebase Rules API.

Usage (in Google Cloud Shell, signed in as the project owner):
    python firebase_rules.py PROJECT_ID
"""
import subprocess
import sys
from pathlib import Path

import requests

project = sys.argv[1]
token = subprocess.run(["gcloud", "auth", "print-access-token"], check=True,
                       capture_output=True, text=True).stdout.strip()
headers = {"Authorization": f"Bearer {token}", "x-goog-user-project": project}
base = f"https://firebaserules.googleapis.com/v1/projects/{project}"
source = (Path(__file__).parent / "firestore.rules").read_text()

r = requests.post(f"{base}/rulesets", headers=headers, timeout=30,
                  json={"source": {"files": [{"name": "firestore.rules", "content": source}]}})
r.raise_for_status()
ruleset = r.json()["name"]

release = f"projects/{project}/releases/cloud.firestore"
r = requests.post(f"{base}/releases", headers=headers, timeout=30,
                  json={"name": release, "rulesetName": ruleset})
if r.status_code == 409:   # a release already exists: point it at the new ruleset
    r = requests.patch(f"{base}/releases/cloud.firestore", headers=headers, timeout=30,
                       json={"release": {"name": release, "rulesetName": ruleset}})
r.raise_for_status()
print(f"Security Rules deployed: {ruleset} (allow read, write: if false)")
