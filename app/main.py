import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

app = FastAPI()

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# Use persistent volume path if available, else local
DB_PATH = "/data/app.db" if os.path.isdir("/data") else str(Path(__file__).resolve().parent.parent / "app.db")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Database Setup ──────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                customer_name TEXT NOT NULL,
                pickup_time TEXT,
                notes TEXT,
                status TEXT NOT NULL DEFAULT 'confirmed',
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id TEXT NOT NULL REFERENCES orders(id),
                menu_item_id TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                size TEXT,
                special_instructions TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS drink_logs (
                id TEXT PRIMARY KEY,
                drink_id TEXT NOT NULL,
                drink_name TEXT NOT NULL,
                milk TEXT,
                decaf INTEGER NOT NULL DEFAULT 0,
                chai_style TEXT,
                source TEXT DEFAULT 'manual',
                timestamp TEXT NOT NULL,
                date TEXT NOT NULL,
                hour INTEGER NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_drink_logs_date ON drink_logs(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)")


@app.on_event("startup")
def on_startup():
    init_db()


# ── Models ──────────────────────────────────────────────────

class OrderItemIn(BaseModel):
    menu_item_id: str
    quantity: int = 1
    size: Optional[str] = None
    special_instructions: Optional[str] = None


class CreateOrder(BaseModel):
    items: list[OrderItemIn]
    customer_name: str
    pickup_time: Optional[str] = None
    notes: Optional[str] = None


class DrinkLogIn(BaseModel):
    drink_id: str
    drink_name: str
    milk: Optional[str] = None
    decaf: bool = False
    chai_style: Optional[str] = None
    source: str = "manual"


# ── Helpers ─────────────────────────────────────────────────

def row_to_dict(row):
    return dict(row) if row else None


def build_order_dict(conn, order_row):
    d = row_to_dict(order_row)
    items = conn.execute(
        "SELECT menu_item_id, quantity, size, special_instructions FROM order_items WHERE order_id = ?",
        (d["id"],)
    ).fetchall()
    d["items"] = [row_to_dict(i) for i in items]
    return d


# ── Menu Endpoint ───────────────────────────────────────────

@app.get("/api/menu-config")
async def get_menu_config():
    cfg_path = STATIC_DIR / "menu-config.json"
    if cfg_path.exists():
        return json.loads(cfg_path.read_text())
    return {"menu": [], "categories": []}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


# ── Order Endpoints ─────────────────────────────────────────

@app.post("/api/orders")
async def create_order(order: CreateOrder):
    order_id = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as conn:
        conn.execute(
            "INSERT INTO orders (id, customer_name, pickup_time, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (order_id, order.customer_name, order.pickup_time, order.notes, "confirmed", now),
        )
        for item in order.items:
            conn.execute(
                "INSERT INTO order_items (order_id, menu_item_id, quantity, size, special_instructions) VALUES (?, ?, ?, ?, ?)",
                (order_id, item.menu_item_id, item.quantity, item.size, item.special_instructions),
            )
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        return build_order_dict(conn, row)


@app.get("/api/orders")
async def get_orders(status: Optional[str] = None):
    with get_db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
        return [build_order_dict(conn, r) for r in rows]


@app.get("/api/orders/all")
async def get_all_orders():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM orders WHERE status != 'completed' ORDER BY created_at DESC"
        ).fetchall()
        return [build_order_dict(conn, r) for r in rows]


@app.patch("/api/orders/{order_id}/status")
async def update_order_status(order_id: str, status: str = Query(...)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        updated = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        result = build_order_dict(conn, updated)

        # Auto-log drinks to tracker when order is picked up
        if status == "completed":
            items = conn.execute(
                "SELECT menu_item_id, quantity, special_instructions FROM order_items WHERE order_id = ?",
                (order_id,)
            ).fetchall()
            now = datetime.now(timezone.utc)
            date_key = now.strftime("%Y-%m-%d")
            hour = now.hour

            menu_names = {}
            cfg_path = STATIC_DIR / "menu-config.json"
            if cfg_path.exists():
                cfg = json.loads(cfg_path.read_text())
                for m in cfg.get("menu", []):
                    menu_names[m["id"]] = m["name"]

            milk_names = ["Oat", "Whole", "2%", "Coconut", "Pistachio", "Almond"]

            for item in items:
                item_d = row_to_dict(item)
                name = menu_names.get(item_d["menu_item_id"], item_d["menu_item_id"])
                instr = item_d.get("special_instructions") or ""

                milk = None
                for m in milk_names:
                    if f"{m.lower()} milk" in instr.lower():
                        milk = m
                        break

                decaf = "decaf" in instr.lower()

                chai_style = None
                if "spicy" in instr.lower():
                    chai_style = "Spicy"
                elif "regular" in instr.lower() and "chai" in name.lower():
                    chai_style = "Regular"

                qty = item_d.get("quantity", 1)
                for _ in range(qty):
                    log_id = uuid.uuid4().hex[:8]
                    conn.execute(
                        "INSERT INTO drink_logs (id, drink_id, drink_name, milk, decaf, chai_style, source, timestamp, date, hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (log_id, item_d["menu_item_id"], name, milk, 1 if decaf else 0, chai_style, "online", now.isoformat(), date_key, hour),
                    )

        return result


# ── Drink Tracker Endpoints ─────────────────────────────────

@app.post("/api/drinks")
async def log_drink(drink: DrinkLogIn):
    now = datetime.now(timezone.utc)
    log_id = uuid.uuid4().hex[:8]
    date_key = now.strftime("%Y-%m-%d")
    hour = now.hour

    with get_db() as conn:
        conn.execute(
            "INSERT INTO drink_logs (id, drink_id, drink_name, milk, decaf, chai_style, source, timestamp, date, hour) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (log_id, drink.drink_id, drink.drink_name, drink.milk, 1 if drink.decaf else 0, drink.chai_style, drink.source, now.isoformat(), date_key, hour),
        )
        return {
            "id": log_id,
            "drink_id": drink.drink_id,
            "drink_name": drink.drink_name,
            "milk": drink.milk,
            "decaf": drink.decaf,
            "chai_style": drink.chai_style,
            "source": drink.source,
            "timestamp": now.isoformat(),
            "date": date_key,
            "hour": hour,
        }


@app.get("/api/drinks")
async def get_drinks(date: Optional[str] = None):
    with get_db() as conn:
        if date:
            rows = conn.execute("SELECT * FROM drink_logs WHERE date = ? ORDER BY timestamp DESC", (date,)).fetchall()
        else:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            rows = conn.execute("SELECT * FROM drink_logs WHERE date = ? ORDER BY timestamp DESC", (today,)).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            d["decaf"] = bool(d["decaf"])
            result.append(d)
        return result


@app.get("/api/drinks/history")
async def get_drink_history():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT date, COUNT(*) as total,
                   GROUP_CONCAT(hour) as hours
            FROM drink_logs
            GROUP BY date
            ORDER BY date DESC
            LIMIT 30
        """).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            hours = [int(h) for h in d["hours"].split(",")]
            hour_counts = {}
            for h in hours:
                hour_counts[h] = hour_counts.get(h, 0) + 1
            peak_hour = max(hour_counts, key=hour_counts.get)
            peak_count = hour_counts[peak_hour]
            result.append({
                "date": d["date"],
                "total": d["total"],
                "peak_hour": peak_hour,
                "peak_count": peak_count,
            })
        return result


@app.delete("/api/drinks/{drink_id}")
async def delete_drink(drink_id: str):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM drink_logs WHERE id = ?", (drink_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Drink log not found")
        conn.execute("DELETE FROM drink_logs WHERE id = ?", (drink_id,))
        return {"deleted": True, "id": drink_id}


# ── Static Files (frontend) ─────────────────────────────────

@app.get("/orders.html")
async def orders_page():
    return FileResponse(STATIC_DIR / "orders.html")


@app.get("/tracker.html")
async def tracker_page():
    return FileResponse(STATIC_DIR / "tracker.html")


@app.get("/")
async def index_page():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/", StaticFiles(directory=str(STATIC_DIR)), name="static")
