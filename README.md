# Hostel Management System

Private hostel management web app (PKR) for HOSTEL DE KHAS. A static site on GitHub Pages. No server, no database, no paid services.

## How it works
- **Data:** JSON files in the private repo `Tahakhurram/hostel-data` (`hostels.json`, `hostels/<id>.json`). Every save is a git commit tagged with the username, so the repo's history is a full audit log.
- **Sign-in:** username and password. `users.json` (in this repo) holds each login's GitHub token, encrypted with its password (PBKDF2-SHA256, 600k iterations, then AES-256-GCM). It is decrypted in the browser. Without the password the token can't be recovered.
- **Excel:** a full export (backup) and bulk import of rooms, residents and expenses from templates, under Import / Export.

## Logins
Run in your own terminal (not through an AI assistant):

```
python3 tools/create_logins.py
```

It asks for the owner and manager tokens (hidden input), creates owner1–3 and manager1–2 with random passwords, uploads `credentials/credentials.xlsx` to the private data repo, and pushes `users.json`.
Re-run it when a token expires or to reset all passwords. To lock someone out immediately, revoke their token on GitHub.

Tokens: GitHub → Settings → Developer settings → Fine-grained tokens. Only select `hostel-data`, and set **Contents: Read and write**.
