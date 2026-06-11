# Cognition Coffee Bar

A full-stack coffee ordering and drink tracking app built with **FastAPI** (Python) and a vanilla JS frontend.

## Features

- **Menu & Ordering** — Browse the menu, customize drinks (milk, decaf, chai style), and place orders
- **Order Management** — Staff dashboard to view, update status, and complete orders (`orders.html`)
- **Drink Tracker** — Log drinks served and view daily/historical stats (`tracker.html`)
- **Configurable Menu** — Edit `static/menu-config.json` to update menu items, roasters, and pour-over details

## Project Structure

```
cog-coffee/
├── app/
│   ├── __init__.py
│   └── main.py          # FastAPI backend (API + static file serving)
├── static/
│   ├── index.html        # Customer-facing menu & ordering page
│   ├── orders.html       # Staff order management dashboard
│   ├── tracker.html      # Drink logging & analytics tracker
│   ├── app.js            # Frontend logic
│   ├── styles.css         # Styles
│   ├── menu-config.json  # Menu configuration (items, roasters, etc.)
│   ├── manifest.json     # PWA manifest
│   └── ...               # Icons and other assets
├── tests/
├── pyproject.toml        # Poetry dependencies
└── poetry.lock
```

## Getting Started

### Prerequisites

- Python 3.12+
- [Poetry](https://python-poetry.org/)

### Install & Run

```bash
# Install dependencies
poetry install

# Run the dev server
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The app will be available at [http://localhost:8000](http://localhost:8000).

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Main menu page |
| `GET` | `/orders.html` | Order management dashboard |
| `GET` | `/tracker.html` | Drink tracker |
| `GET` | `/healthz` | Health check |
| `GET` | `/api/menu-config` | Menu configuration |
| `POST` | `/api/orders` | Create a new order |
| `GET` | `/api/orders` | List orders (optionally filter by `?status=`) |
| `GET` | `/api/orders/all` | List all non-completed orders |
| `PATCH` | `/api/orders/{id}/status` | Update order status (`?status=`) |
| `POST` | `/api/drinks` | Log a drink |
| `GET` | `/api/drinks` | Get today's drink logs (or `?date=YYYY-MM-DD`) |
| `GET` | `/api/drinks/history` | Get 30-day drink history |
| `DELETE` | `/api/drinks/{id}` | Delete a drink log |

### Database

Uses SQLite (file: `app.db` in project root, or `/data/app.db` if a `/data` volume is mounted). The database is auto-created on first startup.
