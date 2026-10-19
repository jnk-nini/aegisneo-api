#!/usr/bin/env bash
# Creates the Firestore test database and runs Phase 2 + Phase 3 for Firebase.
# Run in Google Cloud Shell (already signed in as the project owner):
#   bash firebase_setup.sh PROJECT_ID
# Output is also saved to ~/firebase-results.txt.
set -euo pipefail

PROJECT_ID="${1:?usage: bash firebase_setup.sh PROJECT_ID}"
REGION="asia-southeast1"                       # Singapore, same as Neon and Supabase
SA_NAME="aegis-api"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="$HOME/.aegis-api-key.json"           # outside the repository, deleted at the end
OUT="$HOME/firebase-results.txt"
HERE="$(cd "$(dirname "$0")" && pwd)"

exec > >(tee "$OUT") 2>&1

step() { echo; echo "##### $*"; }

cleanup() {
  if [[ -f "$KEY_FILE" ]]; then
    KEY_ID=$(python3 -c "import json;print(json.load(open('$KEY_FILE'))['private_key_id'])")
    gcloud iam service-accounts keys delete "$KEY_ID" --iam-account="$SA_EMAIL" --quiet >/dev/null 2>&1 || true
    rm -f "$KEY_FILE"
    echo; echo "Cleanup: service-account key deleted from Google and from disk."
  fi
}
trap cleanup EXIT

step "0. Project"
gcloud config set project "$PROJECT_ID" --quiet
gcloud projects describe "$PROJECT_ID" --format="value(projectId,name,createTime)"

step "Enable the needed Google APIs"
gcloud services enable firestore.googleapis.com firebaserules.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com cloudresourcemanager.googleapis.com --quiet

step "Create the Cloud Firestore database (Native mode, ${REGION})"
if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  gcloud firestore databases create --database="(default)" --location="$REGION" --type=firestore-native --quiet
fi
gcloud firestore databases describe --database="(default)" \
  --format="table(name.basename(),locationId,type,createTime)"

step "Python environment"
python3 -m venv "$HOME/aegis-venv"
"$HOME/aegis-venv/bin/pip" install -q --upgrade pip
"$HOME/aegis-venv/bin/pip" install -q firebase-admin requests
PY="$HOME/aegis-venv/bin/python"
$PY -c "import firebase_admin; print('firebase-admin', firebase_admin.__version__)"

step "Security Rules: production mode (deny all client reads and writes)"
cat "$HERE/firestore.rules"
$PY "$HERE/firebase_rules.py" "$PROJECT_ID"

step "Service account '${SA_NAME}' with only the 'Cloud Datastore User' role"
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="AegisNEO API (Firestore data access only)" --quiet
fi
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user" --condition=None --quiet >/dev/null
gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
  --filter="bindings.members:${SA_EMAIL}" --format="table(bindings.role,bindings.members)"

export FIREBASE_PROJECT_ID="$PROJECT_ID"
if gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL" --quiet 2>/dev/null; then
  chmod 600 "$KEY_FILE"
  export GOOGLE_APPLICATION_CREDENTIALS="$KEY_FILE"
  echo "Key file created at $KEY_FILE (chmod 600, contents never printed, deleted at the end)."
else
  echo "Key creation is blocked here; using short-lived impersonated credentials instead."
  gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
    --member="user:$(gcloud config get-value account 2>/dev/null)" \
    --role="roles/iam.serviceAccountTokenCreator" --quiet >/dev/null
  export AEGIS_IMPERSONATE="$SA_EMAIL"
fi

echo "Waiting 60 s for the new IAM permissions to take effect..."
sleep 60

step "PHASE 2: tasks 1-6"
cd "$HERE"
$PY firestore_tasks.py --tasks 1-6 --reset

step "PHASE 3: connectivity and security checks"
$PY test_firestore.py

echo
echo "All output saved to $OUT"
