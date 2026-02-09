function api(path) {
  return `/api${path}`;
}

function setToken(t) { localStorage.setItem("token", t); }
function getToken() { return localStorage.getItem("token"); }
function clearToken() { localStorage.removeItem("token"); }

// -------- Poll/Seiten-Helper --------
function getPollIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function setTextIfExists(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

// Wird automatisch ausgeführt, wenn die Seite passende Elemente enthält.
async function bootPage() {
  // 1) Menü-Seite (polls.html): Liste laden, wenn #pollList existiert
  const pollListEl = document.getElementById("pollList");
  if (pollListEl) {
    await loadPollList();
  }

  // 2) Detail-Seite (vote.html): Frage laden, wenn #question existiert
  const questionEl = document.getElementById("question");
  if (questionEl) {
    const pollId = getPollIdFromUrl();

    // Wenn keine ID vorhanden ist: zurück zur Übersicht
    if (!pollId) {
      // Falls ihr vote.html auch ohne ID nutzen wollt, könnt ihr diesen Redirect entfernen.
      window.location.href = "/polls.html";
      return;
    }

    await loadPollDetails(pollId);
  }
}

document.addEventListener("DOMContentLoaded", bootPage);

// -------- Login --------
async function doLogin() {
  const username = document.getElementById("username").value.trim();
  if (username.length < 2) {
    alert("Username zu kurz.");
    return;
  }

  const res = await fetch(api("/login"), {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ username })
  });

  if (!res.ok) {
    alert("Login fehlgeschlagen.");
    return;
  }

  const data = await res.json();
  setToken(data.token);

  // Neu: Nach Login zuerst in die Übersicht der Abstimmungen.
  window.location.href = "/polls.html";
}

// -------- Poll-Liste (Übersicht) --------
async function loadPollList() {
  const pollListEl = document.getElementById("pollList");
  if (!pollListEl) return;

  // Erwartet Backend: GET /api/polls -> [{id,title,active}, ...]
  const res = await fetch(api("/polls"));
  if (!res.ok) {
    pollListEl.innerHTML = "<div>Konnte Abstimmungen nicht laden.</div>";
    return;
  }

  const polls = await res.json();
  if (!Array.isArray(polls) || polls.length === 0) {
    pollListEl.innerHTML = "<div>Keine Abstimmungen verfügbar.</div>";
    return;
  }

  pollListEl.innerHTML = polls.map(p => {
    const title = (p.title ?? p.question ?? "(ohne Titel)");
    const active = (p.active ?? p.is_active ?? true);
    const status = active ? "aktiv" : "geschlossen";

    return `
      <a class="poll" href="/vote.html?id=${encodeURIComponent(p.id)}">
        <div>
          <div style="font-weight:700">${escapeHtml(title)}</div>
          <div class="meta">ID: ${escapeHtml(String(p.id))}</div>
        </div>
        <span class="tag">${status}</span>
      </a>
    `;
  }).join("");
}

// -------- Poll-Details (Detail-Seite) --------
async function loadPollDetails(pollId) {
  // Erwartet Backend: GET /api/polls/{id} -> {id,title/options/...}
  const res = await fetch(api(`/polls/${encodeURIComponent(pollId)}`));
  if (!res.ok) {
    setTextIfExists("question", "Frage: (konnte nicht geladen werden)");
    return;
  }

  const poll = await res.json();
  const title = (poll.title ?? poll.question ?? "(ohne Titel)");
  setTextIfExists("question", `Frage: ${title}`);
}

// -------- Abstimmen --------
async function submitVote(choice) {
  const token = getToken();
  if (!token) {
    alert("Nicht eingeloggt.");
    window.location.href = "/";
    return;
  }

  const pollId = getPollIdFromUrl();
  if (!pollId) {
    alert("Keine Abstimmung ausgewählt.");
    window.location.href = "/polls.html";
    return;
  }

  // Neu: pollId mitsenden, damit es mehrere Abstimmungen geben kann.
  const res = await fetch(api("/vote"), {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ poll_id: pollId, choice })
  });

  if (res.status === 409) {
    alert("Du hast schon abgestimmt.");
    return;
  }

  if (!res.ok) {
    alert("Vote fehlgeschlagen.");
    return;
  }

  alert("Abstimmung gespeichert.");
}

// -------- Ergebnisse (öffentlich) --------
async function loadPublicResults() {
  const pollId = getPollIdFromUrl();
  if (!pollId) {
    document.getElementById("results").innerText = "Keine Abstimmung ausgewählt.";
    return;
  }

  // Erwartet Backend: GET /api/results?poll_id=...
  const res = await fetch(api(`/results?poll_id=${encodeURIComponent(pollId)}`));
  if (!res.ok) {
    document.getElementById("results").innerText = "Konnte Ergebnisse nicht laden.";
    return;
  }

  const d = await res.json();
  document.getElementById("results").innerText =
    `Gesamt: ${d.total}\nJa: ${d.yes}\nNein: ${d.no}`;
}

// -------- Ergebnisse (Admin) --------
async function loadAdminResults() {
  const code = document.getElementById("admincode").value.trim();
  if (!code) {
    alert("Admin-Code fehlt.");
    return;
  }

  const pollId = getPollIdFromUrl();
  if (!pollId) {
    alert("Keine Abstimmung ausgewählt.");
    return;
  }

  // Erwartet Backend: GET /api/admin/results?poll_id=...
  const res = await fetch(api(`/admin/results?poll_id=${encodeURIComponent(pollId)}`), {
    headers: { "X-Admin-Code": code }
  });

  if (res.status === 401) {
    alert("Falscher Admin-Code.");
    return;
  }

  if (!res.ok) {
    alert("Admin-Results fehlgeschlagen.");
    return;
  }

  const d = await res.json();
  document.getElementById("adminresults").innerText =
    `Gesamt: ${d.total}\nJa: ${d.yes}\nNein: ${d.no}`;
}

function logout() {
  clearToken();
  window.location.href = "/";
}

// -------- Utils --------
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}