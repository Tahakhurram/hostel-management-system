#!/usr/bin/env python3
"""
Create the app's username/password logins.

Run this yourself, in your own terminal (NOT inside Claude):
    python3 tools/create_logins.py

What it does:
  1. Asks for your two fine-grained GitHub tokens (input is hidden).
  2. Generates 3 owner + 2 manager logins with strong random passwords.
  3. Encrypts the matching token with each password -> users.json (safe to publish:
     without the password the token cannot be recovered).
  4. Uploads credentials.xlsx (usernames + passwords) to the PRIVATE data repo.
  5. Commits and pushes users.json to this (public) app repo.

Re-run it whenever a token expires or you want to replace passwords.
"""
import base64, datetime, getpass, io, json, os, secrets, subprocess, sys, urllib.error, urllib.request

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import openpyxl
from openpyxl.styles import Font, PatternFill

GH_OWNER = "Tahakhurram"
DATA_REPO = "hostel-data"
ITERATIONS = 600_000
USERS = [("owner1", "owner"), ("owner2", "owner"), ("owner3", "owner"), ("manager1", "manager"), ("manager2", "manager")]
ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def b64(b): return base64.b64encode(b).decode()


def make_password():
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(4))  # e.g. Kx7m-Pq2r-Tz8w-Hn4c


def encrypt(password, payload):
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode())
    ct = AESGCM(key).encrypt(iv, json.dumps(payload).encode(), None)
    return {"salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}


def gh(token, method, path, body=None):
    req = urllib.request.Request("https://api.github.com" + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, {}


def check_token(label, token):
    status, repo = gh(token, "GET", f"/repos/{GH_OWNER}/{DATA_REPO}")
    if status != 200:
        sys.exit(f"{label} token cannot access {GH_OWNER}/{DATA_REPO} (HTTP {status}). Check the token's repository access.")
    if not repo.get("permissions", {}).get("push"):
        sys.exit(f"{label} token is read-only. Give it Contents: Read and write.")
    print(f"  {label} token OK (read & write)")


def main():
    print(f"Data repo: {GH_OWNER}/{DATA_REPO}\n")
    owner_token = getpass.getpass("Paste the OWNER token (hidden): ").strip()
    manager_token = getpass.getpass("Paste the MANAGER token (hidden): ").strip()
    check_token("Owner", owner_token)
    check_token("Manager", manager_token)

    today = datetime.date.today().isoformat()
    records, rows = [], []
    for username, role in USERS:
        pw = make_password()
        token = owner_token if role == "owner" else manager_token
        rec = {"username": username, "role": role, **encrypt(pw, {"token": token, "owner": GH_OWNER, "repo": DATA_REPO})}
        records.append(rec)
        rows.append((username, pw, role.capitalize(), today))

    with open(os.path.join(APP_DIR, "users.json"), "w") as f:
        json.dump({"version": 1, "iterations": ITERATIONS, "users": records}, f, indent=2)
        f.write("\n")

    # credentials.xlsx -> private data repo
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Credentials"
    ws.append(["Username", "Password", "Role", "Created", "Given to"])
    for r in rows: ws.append(list(r) + [""])
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="111111")
    for col, w in zip("ABCDE", (14, 24, 10, 12, 24)): ws.column_dimensions[col].width = w
    buf = io.BytesIO(); wb.save(buf)
    path = f"/repos/{GH_OWNER}/{DATA_REPO}/contents/credentials/credentials.xlsx"
    status, existing = gh(owner_token, "GET", path)
    body = {"message": "Update login credentials", "content": b64(buf.getvalue())}
    if status == 200: body["sha"] = existing["sha"]
    status, _ = gh(owner_token, "PUT", path, body)
    if status not in (200, 201): sys.exit(f"Upload of credentials.xlsx failed (HTTP {status}).")
    print(f"\nUploaded credentials.xlsx to {GH_OWNER}/{DATA_REPO}/credentials/")

    subprocess.run(["git", "-C", APP_DIR, "add", "users.json"], check=True)
    subprocess.run(["git", "-C", APP_DIR, "commit", "-m", "Update encrypted logins"], check=False)
    subprocess.run(["git", "-C", APP_DIR, "push"], check=True)

    print("\nLogins created:")
    for u, p, r, _ in rows: print(f"  {r:8} {u:10} {p}")
    print("\nThese are also in credentials/credentials.xlsx in the private data repo.")


if __name__ == "__main__":
    main()
