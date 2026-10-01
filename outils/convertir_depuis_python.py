"""
Bourgeon — conversion des données de l'appli bureau (Python / SQLite) vers
l'appli web.

Lit data/bourgeon.db en LECTURE SEULE et écrit un fichier JSON à importer
dans l'appli web (bouton « Données » ▸ « Importer »).

Utilisation :
    python outils/convertir_depuis_python.py [chemin/vers/bourgeon.db] [sortie.json]

Par défaut : ../bullet_hab_tracker/data/bourgeon.db -> bourgeon-donnees-python.json
"""

import json
import sqlite3
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT.parent / "bullet_hab_tracker" / "data" / "bourgeon.db"
DEFAULT_OUT = ROOT / "bourgeon-donnees-python.json"

FORMAT_VERSION = 1   # doit correspondre à Bourgeon.store.VERSION


def day_part(iso):
    """'2026-07-13T13:47:10' -> '2026-07-13' (None reste None)."""
    return iso[:10] if iso else None


def to_ms(iso):
    """Date-heure locale ISO -> millisecondes depuis 1970 (heure locale)."""
    return int(datetime.fromisoformat(iso).timestamp() * 1000)


def parse_steps(text):
    steps = sorted({int(p) for p in text.split(",") if p.strip() and int(p) > 0})
    return steps or [1, 7, 30, 90]


def convert(db_path):
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    q = lambda sql: con.execute(sql).fetchall()
    report = []

    # ---------- Journal ----------
    entries = {}
    for r in q("SELECT * FROM journal_entries ORDER BY entry_date"):
        text = (r["content"] or "").strip()
        if text:  # l'appli web ne garde pas les entrées vides
            entries[r["entry_date"]] = {"text": text, "updatedAt": r["updated_at"]}
    report.append(f"Journal : {len(entries)} entrées (entrées vides ignorées)")

    # ---------- Habitudes ----------
    items, checks, targets = [], {}, []
    for r in q("SELECT * FROM habits ORDER BY position, id"):
        hid = f"h{r['id']}"
        items.append({
            "id": hid, "name": r["name"].strip(), "position": r["position"],
            "baseTarget": r["monthly_goal"], "createdAt": day_part(r["created_at"]),
            "archivedAt": day_part(r["archived_at"]),
        })
        checks[hid] = {}
    for r in q("SELECT * FROM habit_logs"):
        checks.setdefault(f"h{r['habit_id']}", {})[r["log_date"]] = True
    for r in q("SELECT * FROM habit_month_goals"):
        targets.append({"habitId": f"h{r['habit_id']}", "month": r["month"], "target": r["monthly_goal"]})
    n_logs = sum(len(v) for v in checks.values())
    report.append(f"Habitudes : {len(items)} (dont {sum(1 for h in items if h['archivedAt'])} archivées), "
                  f"{n_logs} coches, {len(targets)} changements d'objectif")

    # ---------- Objectifs ----------
    status_map = {"in_progress": "active", "achieved": "done", "abandoned": "abandoned"}
    goals = [{
        "id": f"g{r['id']}", "name": r["name"], "deadline": r["due_date"],
        "status": status_map.get(r["status"], "active"), "createdAt": day_part(r["created_at"]),
        "note": r["notes"] or "",
    } for r in q("SELECT * FROM goals ORDER BY id")]
    report.append(f"Objectifs : {len(goals)}")

    # ---------- Eisenhower ----------
    tasks, rank = [], {}
    for r in q("SELECT * FROM eisenhower_tasks ORDER BY quadrant, priority, id"):
        z = r["quadrant"]
        rank[z] = rank.get(z, -1) + 1
        tasks.append({
            "id": f"t{r['id']}", "text": r["description"], "deadline": r["deadline"] or "",
            "done": bool(r["done"]), "zone": z, "rank": rank[z],
        })
    report.append(f"Eisenhower : {len(tasks)} tâches")

    # ---------- Révisions ----------
    s = q("SELECT * FROM concept_settings WHERE id = 1")
    default_steps = parse_steps(s[0]["paliers_days"]) if s else [1, 7, 30, 90]
    day_start = s[0]["day_start_hour"] if s else 0

    step_types = [{"id": f"p{r['id']}", "name": r["name"], "steps": parse_steps(r["days_text"])}
                  for r in q("SELECT * FROM concept_palier_types ORDER BY id")]
    steps_by_type = {t["id"]: t["steps"] for t in step_types}

    subjects = [{
        "id": f"s{r['id']}", "name": r["name"], "frozenAt": day_part(r["frozen_at"]),
        "stepTypeId": f"p{r['palier_type_id']}" if r["palier_type_id"] else None,
    } for r in q("SELECT * FROM concept_subjects ORDER BY id")]
    subject_steps = {x["id"]: steps_by_type.get(x["stepTypeId"], default_steps) for x in subjects}

    chapters = [{
        "id": f"c{r['id']}", "subjectId": f"s{r['subject_id']}", "name": r["name"],
        "frozenAt": day_part(r["frozen_at"]),
    } for r in q("SELECT * FROM concept_chapters ORDER BY id")]
    chapter_subject = {c["id"]: c["subjectId"] for c in chapters}

    concepts, inferred = [], 0
    for r in q("SELECT * FROM concepts ORDER BY id"):
        steps = subject_steps.get(chapter_subject.get(f"c{r['chapter_id']}"), default_steps)
        added = date.fromisoformat(r["added_at"])
        raw = r["step_dates"].split(",") if r["step_dates"] else []
        raw = (raw + ["?"] * r["steps_completed"])[: r["steps_completed"]]
        validations = []
        for i, d in enumerate(raw):
            if d == "?":
                # Date réelle inconnue (validée avant l'historique des dates) :
                # l'appli Python calcule alors l'échéance suivante depuis la date
                # d'ajout. On prend la date « à l'heure » théorique, ce qui donne
                # exactement la même échéance dans l'appli web.
                validations.append((added + timedelta(days=steps[min(i, len(steps) - 1)])).isoformat())
                inferred += 1
            else:
                validations.append(d)
        concepts.append({
            "id": f"k{r['id']}", "chapterId": f"c{r['chapter_id']}", "name": r["name"],
            "addedAt": r["added_at"], "validations": validations,
            "lastMaintenance": day_part(r["last_maintenance_at"]), "frozenAt": day_part(r["frozen_at"]),
        })
    report.append(f"Révisions : {len(subjects)} matières, {len(chapters)} chapitres, {len(concepts)} concepts, "
                  f"{len(step_types)} type(s) de paliers ; {inferred} dates de palier inconnues reconstituées")

    # ---------- Focus ----------
    mode_map = {"stopwatch": "chrono", "timer": "sablier", "pomodoro": "pomodoro"}
    sessions = []
    for r in q("SELECT * FROM study_sessions ORDER BY started_at"):
        subject_id = f"s{r['subject_id']}" if r["subject_id"] else None
        chapter_id = f"c{r['chapter_id']}" if r["chapter_id"] else None
        if chapter_id and not subject_id:
            subject_id = chapter_subject.get(chapter_id)
        mode = mode_map.get(r["mode"], "chrono")
        sessions.append({
            "id": f"f{r['id']}", "subjectId": subject_id, "chapterId": chapter_id, "mode": mode,
            "startedAt": to_ms(r["started_at"]), "endedAt": to_ms(r["ended_at"]), "day": day_part(r["started_at"]),
            "duration": r["duration_seconds"], "plannedSec": r["target_seconds"] if mode == "sablier" else None,
            "completed": bool(r["completed"]),
            "workCycles": r["pomodoro_cycles_done"] if mode == "pomodoro" else None,
        })
    report.append(f"Focus : {len(sessions)} sessions ({sum(s['duration'] for s in sessions) // 3600} h au total)")

    # ---------- Sport ----------
    sp = q("SELECT * FROM sport_settings WHERE id = 1")
    planning = [""] * 7
    for r in q("SELECT * FROM sport_weekly_notes"):
        planning[r["weekday"]] = (r["text"] or "").strip()
    vma = sp[0]["vma_kmh"] if sp else 16.5
    report.append(f"Sport : VMA {vma} km/h, {sum(1 for p in planning if p)} jour(s) de planning")

    con.close()
    data = {
        "version": FORMAT_VERSION,
        "journal": {"entries": entries},
        "habits": {"items": items, "targets": targets, "checks": checks},
        "focus": {"sessions": sessions, "active": None, "settings": {"alerts": True}, "lastConfig": None},
        "goals": {"items": goals},
        "eisenhower": {"tasks": tasks},
        "revisions": {
            "settings": {"defaultSteps": default_steps, "dayStartHour": day_start},
            "stepTypes": step_types, "subjects": subjects, "chapters": chapters, "concepts": concepts,
        },
        "sport": {"vma": vma, "planning": planning},
    }
    return data, report


def main():
    db = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DB
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    data, report = convert(db)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(report))
    print(f"\nFichier écrit : {out}")


if __name__ == "__main__":
    main()
