/**
 * GitHub-Pages-sichere Navigation + Backend-ready API.
 *
 * - Navigation zwischen HTML-Seiten: immer relativ zur aktuellen Datei (kein "/...").
 * - API: standardmäßig "/api" (für Ubuntu-Server-Hosting).
 *   Optional kannst du API_BASE setzen:
 *     - per URL: ?api=https://DEIN-SERVER.tld/api
 *     - oder localStorage: localStorage.setItem("API_BASE","https://.../api")
 */

function go(pageWithQuery) {
  // Relativ zur aktuellen URL (funktioniert in Unterordnern wie voting-app/frontend/)
  window.location.href = new URL(pageWithQuery, window.location.href).toString();
}

function getApiBase() {
  const p = new URLSearchParams(window.location.search);
  const fromQuery = p.get("api");
  const fromStorage = localStorage.getItem("API_BASE");
  return (fromQuery || fromStorage || "/api").replace(/\/+$/, "");
}

function api(path) {
  // path z.B. "/polls" => API_BASE + "/polls"
  const base = getApiBase();
  const full = base + path;
  // Wenn base eine volle URL ist -> new URL(full) ok. Wenn base "/api" -> ok.
  return new URL(full, window.location.origin).toString();
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

// Wird automatisch ausgeführt, wenn die Seite passende Elemente enthält.
async function bootPage() {
  // polls.html: Liste laden, wenn #pollList existiert
  const pollListEl = document.getElementById("pollList");
  if (pollListEl) {
    await loadPollList();
  }

  // vote.html: Frage laden, wenn #question existiert
  const questionEl = document.getElementById("question");
  if (questionEl) {
    const pollId = getPollIdFromUrl();

    // Wenn keine ID vorhanden ist: zurück zur Übersicht
    if (!pollId) {
      go("polls.html");
      return;
    }

    await loadPollDetails(pollId);
  }
}

document.addEventListener("DOMContentLoaded", bootPage);

// -------- Login --------
async function doLogin() {
  const usernameEl = document.getElementById("username");
  const username = (usernameEl?.value || "").trim();

  if (username.length < 2) {
    alert("Username zu kurz.");
    return;
  }

  try {
    const res = await fetch(api("/login"), {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ username })
    });

    if (!res.ok) {
      // Falls Backend nicht läuft: trotzdem weiterlassen (Demo)
      alert("Login-API nicht erreichbar – Demo-Modus: du kommst trotzdem weiter.");
      setToken("demo-token");
      go("polls.html");
      return;
    }

    const data = await res.json();
    setToken(data.token);
    go("polls.html");
  } catch (e) {
    alert("Backend nicht erreichbar – Demo-Modus: du kommst trotzdem weiter.");
    setToken("demo-token");
    go("polls.html");
  }
}

// -------- Poll-Liste (Übersicht) --------
async function loadPollList() {
  const pollListEl = document.getElementById("pollList");
  if (!pollListEl) return;

  // Fallback-Demo, falls Backend noch nicht steht:
  const demoPolls = [
    { id: "demo-1", title: "Soll die Mensa länger offen sein?", active: true },
    { id: "demo-2", title: "Soll es mehr Sitzplätze im Schulhof geben?", active: true },
  ];

  try {
    const res = await fetch(api("/polls"));
    if (!res.ok) throw new Error("polls not ok");

    const polls = await res.json();
    if (!Array.isArray(polls) || polls.length === 0) throw new Error("empty");

    renderPolls(polls);
  } catch {
    // Demo anzeigen, damit die Seite “funktioniert”
    renderPolls(demoPolls, true);
  }

  function renderPolls(polls, isDemo=false) {
    pollListEl.innerHTML = (isDemo ? `<div style="color:#5a7a6e;margin-bottom:8px">Demo-Modus (Backend nicht erreichbar)</div>` : ``) +
      polls.map(p => {
        const title = (p.title ?? p.question ?? "(ohne Titel)");
        const active = (p.active ?? p.is_active ?? true);
        const status = active ? "aktiv" : "geschlossen";

        return `
          <a class="poll" href="./vote.html?id=${encodeURIComponent(p.id)}">
            <div>
              <div style="font-weight:700">${escapeHtml(title)}</div>
              <div class="meta">ID: ${escapeHtml(String(p.id))}</div>
            </div>
            <span class="tag">${status}</span>
          </a>
        `;
      }).join("");
  }
}

// -------- Poll-Details (Detail-Seite) --------
async function loadPollDetails(pollId) {
  try {
    const res = await fetch(api(`/polls/${encodeURIComponent(pollId)}`));
    if (!res.ok) throw new Error("not ok");

    const poll = await res.json();
    const title = (poll.title ?? poll.question ?? "(ohne Titel)");
    setTextIfExists("question", `Frage: ${title}`);
  } catch {
    // Demo-Fallback: zeig wenigstens die ID
    setTextIfExists("question", `Frage (Demo): ${pollId}`);
  }
}

// -------- Abstimmen --------
async function submitVote(choice) {
  const token = getToken();
  if (!token) {
    alert("Nicht eingeloggt.");
    go("index.html");
    return;
  }

  const pollId = getPollIdFromUrl();
  if (!pollId) {
    alert("Keine Abstimmung ausgewählt.");
    go("polls.html");
    return;
  }

  try {
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
      alert("Vote fehlgeschlagen (Backend?).");
      return;
    }
    alert("Abstimmung gespeichert.");
  } catch {
    alert("Backend nicht erreichbar – Vote im Demo-Modus nicht speicherbar.");
  }
}

// -------- Ergebnisse (öffentlich) --------
async function loadPublicResults() {
  const resultsEl = document.getElementById("results");
  const pollId = getPollIdFromUrl();

  if (!resultsEl) return;
  if (!pollId) {
    resultsEl.innerText = "Keine Abstimmung ausgewählt.";
    return;
  }

  try {
    const res = await fetch(api(`/results?poll_id=${encodeURIComponent(pollId)}`));
    if (!res.ok) throw new Error("not ok");

    const d = await res.json();
    resultsEl.innerText = `Gesamt: ${d.total}\nJa: ${d.yes}\nNein: ${d.no}`;
  } catch {
    resultsEl.innerText = "Konnte Ergebnisse nicht laden (Backend?).";
  }
}

function logout() {
  clearToken();
  go("index.html");
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
