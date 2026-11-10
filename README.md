# Hostel Management System

Personal hostel management web app (PKR). Static site on GitHub Pages; **all data lives as JSON in a separate private repo** (`hostel-data`), read/written through the GitHub API. No server, no database.

- **Manager** (write token): rooms/beds, assign/vacate occupants, agreed fees, expenses, add/rename hostels.
- **Owner** (read-only token): dashboard per hostel or all hostels combined.
- Multiple hostels supported; pick one in the header dropdown or view "All hostels (combined)".

## Setup
1. Create a private repo `hostel-data` (can be empty).
2. GitHub → Settings → Developer settings → Fine-grained tokens. Create one per person, limited to the `hostel-data` repo only:
   - Manager: *Contents: Read and write*
   - Owner: *Contents: Read-only*
3. Enable GitHub Pages for this repo (Settings → Pages → Deploy from branch `main`).
4. Open the site, enter your GitHub username, `hostel-data`, and the token. The first manager sign-in creates "HOSTEL DE KHAS".

Tokens are stored only in the browser's localStorage. Every change is a git commit in `hostel-data` (free audit history).
