# 8. Stack & Υποδομή (Δ21)

**Επιλογή: VPS-first με το Cloudflare σε ρόλο υποδομής.** Η εφαρμογή τρέχει σε Docker στο υπάρχον VPS (μαζί με το Open WebUI, σε ξεχωριστά containers και network).

## 8.1 Γιατί

| Απαίτηση | Γιατί κρίνει την επιλογή |
|---|---|
| Ακριβής αριθμητική ποσών | PostgreSQL `numeric(14,2)`. Το D1/SQLite δεν έχει δεκαδικό τύπο — θα απαιτούσε ακέραια λεπτά σε κάθε πράξη |
| PDF πιστά στα έντυπα | Τα HTML mockups γίνονται **αυτούσια templates**, render με headless Chromium — μηδενικό κόστος, πλήρης έλεγχος γραμματοσειρών |
| Reporting (ισοζύγια, ageing, απολογισμός) | Πλήρης SQL: CTEs, window functions |
| Κόστος | Το VPS ήδη πληρώνεται· το Cloudflare καλύπτει DNS/TLS/Tunnel/R2 |
| Lock-in | Κανένα. Η μηχανή κατανομής γράφεται χωρίς I/O και μεταφέρεται οπουδήποτε |

## 8.2 Συνιστώσες

| Στρώμα | Επιλογή |
|---|---|
| Frontend / Backend | **Next.js 15** (App Router) + TypeScript + Tailwind + shadcn/ui, PWA |
| Βάση | **PostgreSQL 17** + **Drizzle ORM** (migrations σε SQL, ελέγξιμες) |
| Auth | **Better-Auth** — email+κωδικός, **magic link**, TOTP για διαχειριστές |
| PDF | **Playwright/Chromium** headless, render των templates → A4 |
| Email | **Resend** με SPF/DKIM/DMARC στο domain *(όχι self-hosted SMTP — τα ειδοποιητήρια θα κατέληγαν spam)* |
| Αρχεία | **Cloudflare R2** (S3 API) για παραστατικά & PDF |
| Δίκτυο | **Cloudflare Tunnel** — καμία ανοιχτή πόρτα στο VPS· DNS, TLS, WAF, Turnstile στο login |
| Ουρές/jobs | pg-boss (ουρά μέσα στην Postgres — χωρίς επιπλέον υπηρεσία) |
| Παρατηρησιμότητα | Sentry + structured logs + `audit_log` |
| Tests | Vitest (μηχανή κατανομής, golden vectors από το υπόδειγμα) + Playwright e2e |

## 8.3 Τοπολογία

```
            Internet
               │  (μόνο μέσω Cloudflare — καμία εκτεθειμένη πόρτα)
        ┌──────▼──────┐
        │ Cloudflare  │  DNS · TLS · WAF · Turnstile · R2
        └──────┬──────┘
               │ Tunnel (cloudflared, outbound-only)
   ┌───────────▼─────────────── VPS ───────────────────────┐
   │  docker network: koina                                │
   │   ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
   │   │ app      │→ │ postgres   │  │ cloudflared      │  │
   │   │ Next.js  │  │ + pgdata   │  │                  │  │
   │   │ +Chromium│  └────────────┘  └──────────────────┘  │
   │   └──────────┘  ┌────────────┐                        │
   │                 │ backup cron│→ pg_dump → R2          │
   │                 └────────────┘                        │
   │  (ξεχωριστό network: open-webui — καμία επαφή)         │
   └───────────────────────────────────────────────────────┘
```

## 8.4 Δομή repository

```
/apps/web                 Next.js (UI + API routes)
/packages/domain          ΚΑΘΑΡΗ μηχανή κατανομής — καμία εξάρτηση από DB/δίκτυο
    allocation.ts         κατανομή δαπανών, χιλιοστά, ώρες, ισα μέρη
    rounding.ts           half-up + ΣΤΡΟΓΓ (Δ14) + two-level (Δ19)
    owner-tenant.ts       κανόνας κατηγορίας (Δ5)
    closed-units.ts       μισά χιλιοστά με αναγωγή (Δ16)
    __tests__/            golden vectors από το υπόδειγμα Apical Service
/packages/db              Drizzle schema + migrations
/packages/pdf             templates (sygkentrotiki, eidopoiitirio) + renderer
/infra                    docker-compose.yml, Caddy/cloudflared config, backup script
/docs                     ο σχεδιασμός
```

## 8.5 Πόροι & συνύπαρξη με το Open WebUI

| Υπηρεσία | RAM σε ηρεμία | Αιχμή |
|---|---|---|
| Next.js app | ~250 MB | ~400 MB |
| PostgreSQL | ~150 MB | ~300 MB |
| Chromium (μόνο κατά την έκδοση PDF) | 0 | ~500 MB |
| cloudflared | ~30 MB | ~50 MB |

**Χρειάζονται ≥1,5 GB ελεύθερης RAM** στις αιχμές. Μέτρα: `mem_limit` ανά container, serial (όχι παράλληλη) παραγωγή PDF, swap file αν το VPS είναι οριακό, ξεχωριστό docker network από το Open WebUI.

## 8.6 Backups & αποκατάσταση

- Νυχτερινό `pg_dump -Fc` → **R2** με rclone· διατήρηση 30 ημερήσια + 12 μηνιαία.
- Τα παραστατικά ζουν ήδη στο R2 (object versioning ενεργό).
- **Δοκιμή επαναφοράς** μία φορά τον μήνα, αυτοματοποιημένη σε container → επιβεβαίωση ότι το dump ανοίγει.
- Κρυπτογράφηση dump (age/gpg) πριν το ανέβασμα — περιέχει προσωπικά δεδομένα ενοίκων.

## 8.7 Deploy

1. Push στο `main` → **GitHub Actions**: lint, typecheck, tests, build Docker image → **GHCR**.
2. Στο VPS: `docker compose pull && docker compose up -d` (μέσω SSH ή webhook), migrations με `drizzle-kit migrate` στο startup.
3. Περιβάλλοντα: `dev` τοπικά με Docker Compose, `prod` στο VPS. Μυστικά σε `.env` εκτός repo.

## 8.8 Πρώτα βήματα υλοποίησης

1. **`packages/domain` + golden tests** από το υπόδειγμα — ο κώδικας που πρέπει να είναι σωστός πριν από οτιδήποτε άλλο.
2. Σχήμα Drizzle + migrations + seed (η πολυκατοικία του υποδείγματος ως δοκιμαστικά δεδομένα).
3. Οθόνες: wizard διαμόρφωσης → φύλλο δαπανών → προεπισκόπηση → οριστικοποίηση.
4. PDF renderer με τα δύο templates.
5. Auth + portal ενοίκου.
6. Email + υπόλοιπα/εισπράξεις.
7. Υποδομή (Tunnel, R2, backups) και πρώτο deploy.
