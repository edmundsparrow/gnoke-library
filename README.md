# 📚 Gnoke Library

Track books, manage loans, and record returns — offline-first.

Part of the **Gnoke Suite** by Edmund Sparrow.

> **Portable. Private. Persistent.**

---

## What It Does

- Catalogue books with title, author, ISBN, category and copies
- Record borrows with due dates; process returns
- Full borrowing history with search and overdue highlighting
- Library status dashboard (total copies, active loans, overdue, top books)
- Demo data included — clear it with one tap when ready to go live
- Backup & restore via `.db` file

---

## Get Started

```bash
git clone https://github.com/edmundsparrow/gnoke-library.git
cd gnoke-library
python -m http.server 8080
```

Then open: http://localhost:8080

⚠ Always run through a local server — do not open HTML files directly.

---

## Privacy

Everything stays in your browser (IndexedDB). No server. No tracking. No ads.

---

## Tech Stack

- HTML / CSS / JavaScript
- SQLite via sql.js (browser-based)
- IndexedDB persistence
- Offline-first PWA with Service Worker

---

## Migrating from Old Version

The old version used LocalForage (JSON arrays). The new version uses SQLite.
Your old data is safe — simply use the Restore feature with a JSON backup from
the old app, or re-enter your catalogue. A migration utility can be added on request.

---

## License

GNU General Public License v3.0 — see LICENSE for details.

---

## Author

**Edmund Sparrow**
edmundsparrow@gmail.com

© 2026 Edmund Sparrow — Gnoke Suite
