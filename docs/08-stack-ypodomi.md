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

**Μετρημένη κατάσταση VPS (hel-vps):** 3,7 GiB RAM συνολικά, 1,6 GiB σε χρήση, **2,2 GiB διαθέσιμα**, **swap 0 B**, δίσκος 38 GB με 23 GB ελεύθερα.

| Container | `mem_limit` | Ηρεμία | Αιχμή |
|---|---|---|---|
| `app` (Next.js) | 640 MB | ~250 MB | ~450 MB |
| `postgres` (`shared_buffers=128MB`, `work_mem=8MB`, `max_connections=20`) | 512 MB | ~150 MB | ~300 MB |
| `pdf` (Chromium, `shm_size: 256m`) | 700 MB | ~90 MB | ~600 MB |
| `cloudflared` | 64 MB | ~30 MB | ~50 MB |
| **Σύνολο ορίων** | **~1,9 GB** | ~520 MB | — |

**Υποχρεωτικό πριν το πρώτο deploy: swapfile 4 GB.** Με 2,2 GiB διαθέσιμα και μηδενικό swap, μια αιχμή του Chromium κατά την έκδοση θα μπορούσε να ενεργοποιήσει τον OOM killer και να σκοτώσει το Open WebUI.

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10   # swap μόνο ως δίχτυ ασφαλείας
```

Πρόσθετα μέτρα:
- **Σειριακή παραγωγή PDF** (ουρά με concurrency 1) — ποτέ 11 Chromium ταυτόχρονα.
- Το Chromium τρέχει σε **ξεχωριστό container** που μπορεί να σταματά εκτός εκδόσεων.
- Προσοχή: `/tmp` και `/dev/shm` είναι **tmpfs 1,9 GB** — μετράνε στη RAM. Τα PDF γράφονται σε R2 ή σε disk volume, όχι στο `/tmp`.
- Ξεχωριστό docker network από το Open WebUI· `mem_limit` και στα δύο stacks.
- Δίσκος: η βάση θα μείνει κάτω από 1 GB για χρόνια· τα παραστατικά πάνε στο R2. Τακτικό `docker image prune`.

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
