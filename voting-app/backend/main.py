from typing import List, Literal, Optional
from pydantic import BaseModel
import time
import sqlite3

class AdminVoteRow(BaseModel):
    created_at: int
    choice: Literal["yes", "no"]

class AdminVotesOut(BaseModel):
    poll_id: str
    total: int
    yes: int
    no: int
    first_vote_at: Optional[int]
    last_vote_at: Optional[int]
    votes: List[AdminVoteRow]

class PollCreateIn(BaseModel):
    title: str

def require_admin(x_admin_code: Optional[str]) -> None:
    if not x_admin_code or x_admin_code != ADMIN_CODE:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.get("/admin/votes", response_model=AdminVotesOut)
def admin_votes(poll_id: str, x_admin_code: Optional[str] = Header(default=None)):
    require_admin(x_admin_code)

    conn = db()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM votes WHERE poll_id=?", (poll_id,))
    total = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM votes WHERE poll_id=? AND choice='yes'", (poll_id,))
    yes = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM votes WHERE poll_id=? AND choice='no'", (poll_id,))
    no = cur.fetchone()[0]

    cur.execute("SELECT MIN(created_at), MAX(created_at) FROM votes WHERE poll_id=?", (poll_id,))
    mn, mx = cur.fetchone()

    cur.execute(
        "SELECT created_at, choice FROM votes WHERE poll_id=? ORDER BY created_at ASC",
        (poll_id,)
    )
    rows = [{"created_at": r[0], "choice": r[1]} for r in cur.fetchall()]
    conn.close()

    return {
        "poll_id": poll_id,
        "total": total,
        "yes": yes,
        "no": no,
        "first_vote_at": mn,
        "last_vote_at": mx,
        "votes": rows,
    }

@app.post("/admin/polls")
def admin_create_poll(body: PollCreateIn, x_admin_code: Optional[str] = Header(default=None)):
    require_admin(x_admin_code)

    title = body.title.strip()
    if len(title) < 5:
        raise HTTPException(status_code=400, detail="Title too short")

    poll_id = f"poll-{int(time.time())}"

    conn = db()
    try:
        conn.execute(
            "INSERT INTO polls(id, title, active) VALUES (?,?,1)",
            (poll_id, title)
        )
        conn.commit()
    finally:
        conn.close()

    return {"id": poll_id, "title": title, "active": True}

@app.delete("/admin/polls/{poll_id}")
def admin_delete_poll(poll_id: str, x_admin_code: Optional[str] = Header(default=None)):
    require_admin(x_admin_code)

    conn = db()
    try:
        conn.execute("DELETE FROM votes WHERE poll_id=?", (poll_id,))
        cur = conn.execute("DELETE FROM polls WHERE id=?", (poll_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Poll not found")
    finally:
        conn.close()

    return {"ok": True}