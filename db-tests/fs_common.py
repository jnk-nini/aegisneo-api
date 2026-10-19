"""Shared Firestore setup: connects with the Firebase Admin SDK as the limited
service account (aegis-api, role "Cloud Datastore User").

Normal case: GOOGLE_APPLICATION_CREDENTIALS points to the service-account key file
(kept outside the repository, deleted after the test).
Fallback: if key creation is blocked, AEGIS_IMPERSONATE holds the service-account
email and short-lived impersonated credentials are used instead (no key file).
"""
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

COLLECTION = "asteroids"
SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


class _GoogleCredential(credentials.Base):
    """Wraps any google-auth credential so firebase_admin can use it."""

    def __init__(self, credential):
        self._credential = credential

    def get_credential(self):
        return self._credential


def connect():
    """Return (firestore client, service-account email, google-auth credential)."""
    project = os.environ.get("FIREBASE_PROJECT_ID")
    if not project:
        sys.exit("Set FIREBASE_PROJECT_ID first.")

    target = os.environ.get("AEGIS_IMPERSONATE")
    if target:
        import google.auth
        from google.auth import impersonated_credentials
        source, _ = google.auth.default(scopes=SCOPES)
        google_cred = impersonated_credentials.Credentials(
            source_credentials=source, target_principal=target,
            target_scopes=SCOPES, lifetime=3600)
        cred = _GoogleCredential(google_cred)
        email = target
    else:
        key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if not key_path:
            sys.exit("Set GOOGLE_APPLICATION_CREDENTIALS (or AEGIS_IMPERSONATE) first.")
        cred = credentials.Certificate(key_path)
        google_cred = cred.get_credential().with_scopes(SCOPES)
        email = cred.service_account_email

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {"projectId": project})
    return firestore.client(), email, google_cred


def keywords(name):
    """Lower-case words of a name, e.g. '99942 Apophis (2004 MN4)' ->
    ['99942', 'apophis', '2004', 'mn4']. Firestore has no LIKE/ILIKE search,
    so this array field makes 'find by name' possible with array-contains."""
    cleaned = "".join(c if c.isalnum() else " " for c in name.lower())
    return cleaned.split()
