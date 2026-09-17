-- ============================================================================
-- Κοινόχρηστα — Σχεδίαση σχήματος βάσης (PostgreSQL) — v0.1 πρόταση
-- Χρηματικά ποσά: numeric(14,2). Υπολογισμοί κατανομής: σε cents (bigint).
-- Multi-tenant: κάθε πίνακας φέρει organization_id (RLS policy ανά org).
-- ============================================================================

-- ---------- Οργανισμοί & χρήστες ----------
CREATE TABLE organizations (
  id uuid PRIMARY KEY, name text NOT NULL, vat_number text,
  plan text NOT NULL DEFAULT 'free', settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (                       -- login με email
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  password_hash text, full_name text, phone text,
  email_verified_at timestamptz, totp_secret text,
  locale text NOT NULL DEFAULT 'el', created_at timestamptz NOT NULL DEFAULT now()
);

-- Πρόσωπο = ένοικος/ιδιοκτήτης, μπορεί να υπάρχει ΧΩΡΙΣ λογαριασμό χρήστη
CREATE TABLE persons (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  user_id uuid REFERENCES users,           -- NULL όσο δεν έχει ενεργοποιήσει login
  full_name text NOT NULL, email citext, phone text, vat_number text,
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Κτίρια & ιδιοκτησίες ----------
CREATE TABLE buildings (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL, address text, postal_code text, city text,
  vat_number text, tax_office text, iban text,
  floors int, has_elevator boolean NOT NULL DEFAULT true,
  heating_type text,                        -- CENTRAL_OIL|GAS|AUTONOMOUS|HEATPUMP|NONE
  has_heat_metering boolean NOT NULL DEFAULT false,
  heating_fixed_pct numeric(5,2),           -- πάγιο % (Π.Δ. 1985)
  billing_cycle text NOT NULL DEFAULT 'MONTHLY',   -- MONTHLY|BIMONTHLY|QUARTERLY|CUSTOM
  default_due_day int NOT NULL DEFAULT 10,
  fuel_costing text NOT NULL DEFAULT 'CASH',       -- CASH|CONSUMPTION
  settings jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true
);

CREATE TABLE units (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  code text NOT NULL,                       -- 'Α1','Β2','ΙΣ1'
  kind text NOT NULL DEFAULT 'APARTMENT',   -- APARTMENT|SHOP|OFFICE|GARAGE|STORAGE|COMMON
  floor int, area_sqm numeric(8,2), persons_count int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  is_closed boolean NOT NULL DEFAULT false, -- [Δ16] κλειστό: μισά χιλιοστά όπου closed_coefficient<1
  closed_from date, closed_to date,
  notes text,
  UNIQUE (building_id, code)
);

-- Πίνακες χιλιοστών, με εκδόσεις (version) που ισχύουν από ημερομηνία
CREATE TABLE distribution_tables (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  code text NOT NULL,                       -- COMMON|ELEVATOR|HEATING|OWNERSHIP|WATER|custom
  name text NOT NULL, total_mills numeric(12,4) NOT NULL DEFAULT 1000,
  UNIQUE (building_id, code)
);

CREATE TABLE distribution_table_versions (
  id uuid PRIMARY KEY, table_id uuid NOT NULL REFERENCES distribution_tables,
  valid_from date NOT NULL, note text,
  UNIQUE (table_id, valid_from)
);

CREATE TABLE unit_mills (
  version_id uuid NOT NULL REFERENCES distribution_table_versions ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units,
  mills numeric(12,4) NOT NULL,
  coefficient numeric(5,4) NOT NULL DEFAULT 1, -- 0 = εξαίρεση, 0.5 = μειωμένη συμμετοχή
  PRIMARY KEY (version_id, unit_id)
);

-- Ποιος κατέχει τι και με ποια ιδιότητα (χρονικά οριοθετημένο)
CREATE TABLE unit_occupancies (
  id uuid PRIMARY KEY, unit_id uuid NOT NULL REFERENCES units,
  person_id uuid NOT NULL REFERENCES persons,
  role text NOT NULL,                       -- OWNER|TENANT
  share_pct numeric(5,2) NOT NULL DEFAULT 100,   -- συνιδιοκτησία/συγκατοίκηση
  valid_from date NOT NULL, valid_to date,
  is_billing_contact boolean NOT NULL DEFAULT true
);

-- Ρόλοι πρόσβασης (ανεξάρτητοι από την ιδιοκτησία)
CREATE TABLE memberships (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users,
  organization_id uuid NOT NULL REFERENCES organizations,
  building_id uuid REFERENCES buildings,    -- NULL = όλο το org
  role text NOT NULL,                       -- ORG_ADMIN|BUILDING_MANAGER|ASSISTANT|AUDITOR|OWNER|TENANT
  valid_from date NOT NULL DEFAULT current_date, valid_to date
);

-- ---------- Ομάδες δαπανών (blocks του εντύπου ↔ στήλες του πίνακα) [Δ13] ----------
CREATE TABLE cost_groups (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  code text NOT NULL,          -- COMMON|HEATING|AUTONOMY|BOILER|ELEVATOR|SPECIAL|ISSUANCE|
                               -- OWNERS|EQUAL_SHARES|INDIVIDUAL|CLOSED|ROUNDING
  block_title text NOT NULL,   -- τίτλος block στο έντυπο, π.χ. 'ΑΥΤΟΤΕΛΕΙΣ ΧΡΕΩΣΕΙΣ ΙΔΙΟΚΤΗΤΩΝ'
  column_title text NOT NULL,  -- τίτλος στήλης, π.χ. 'ΙΔΙΟΚΤΗΤΩΝ'
  table_id uuid REFERENCES distribution_tables,
  method text NOT NULL,        -- BY_MILLS|EQUAL|BY_HOURS|FIXED_PER_UNIT|ROUNDING
  meter_type text,             -- όταν BY_HOURS: HEAT_HOURS|BOILER_HOURS
  owner_pct numeric(5,2) NOT NULL DEFAULT 0,
  owner_share_basis text NOT NULL DEFAULT 'PRORATA',
  sort_order int NOT NULL, is_active boolean NOT NULL DEFAULT true,
  UNIQUE (building_id, code)
);

-- ---------- Δαπάνες ----------
CREATE TABLE expense_categories (
  id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations,  -- NULL = system default
  building_id uuid REFERENCES buildings,        -- NULL = πρότυπο, αλλιώς παραμετροποίηση κτιρίου
  code text NOT NULL, name text NOT NULL,
  cost_group_id uuid REFERENCES cost_groups,    -- [Δ18] ομάδα/στήλη εντύπου
  table_id uuid REFERENCES distribution_tables, -- πίνακας χιλιοστών
  method text NOT NULL DEFAULT 'BY_MILLS',      -- BY_MILLS|EQUAL|BY_HOURS|FIXED_PER_UNIT|HEATING_MIXED
  default_description text,                     -- [Δ18] προτεινόμενη αιτιολογία (= όνομα κατηγορίας)
  closed_coefficient numeric(5,4) NOT NULL DEFAULT 1,  -- [Δ16] 0.5 σε ανελκυστήρα & καθαρισμό
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  -- Κανόνας ιδιοκτήτη/ενοικιαστή (απόφαση Δ5)
  owner_pct numeric(5,2) NOT NULL DEFAULT 0,    -- % της δαπάνης που βαρύνει τον ιδιοκτήτη
  owner_share_basis text NOT NULL DEFAULT 'PRORATA',   -- PRORATA (χιλιοστά) | LUMP_SUM (κατ' αποκοπή)
  owner_lump_amount numeric(14,2),              -- όταν LUMP_SUM: ποσό ανά ιδιοκτησία
  vacant_behavior text NOT NULL DEFAULT 'OWNER_PAYS_ALL', -- OWNER_PAYS_ALL|COEFFICIENT|EXEMPT
  vacant_coefficient numeric(5,4)               -- όταν COEFFICIENT
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL, vat_number text, phone text, email citext, category_code text
);

CREATE TABLE expenses (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  category_id uuid NOT NULL REFERENCES expense_categories,
  cost_group_id uuid NOT NULL REFERENCES cost_groups,   -- σε ποιο block/στήλη τυπώνεται
  supplier_id uuid REFERENCES suppliers,
  expense_date date NOT NULL,
  quantity numeric(12,3), unit_price numeric(12,4),     -- π.χ. 'ΣΥΝΤΗΡΗΣΗ 51,76*3'
  period_from date, period_to date,          -- περίοδος αναφοράς παραστατικού
  description text NOT NULL,                 -- [Δ18] «αιτιολογία» — τυπώνεται αυτούσια στο έντυπο
  document_no text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  vat_amount numeric(14,2) NOT NULL DEFAULT 0,
  table_id uuid REFERENCES distribution_tables,
  method text NOT NULL,                      -- BY_MILLS|EQUAL|PER_PERSON|BY_AREA|BY_CONSUMPTION|HEATING_MIXED|MANUAL|SINGLE_UNIT|SUBSET
  -- overrides του κανόνα της κατηγορίας (NULL = κληρονομεί την κατηγορία)
  owner_pct numeric(5,2), owner_share_basis text, owner_lump_amount numeric(14,2),
  vacant_behavior text, vacant_coefficient numeric(5,4),
  billing_period_id uuid,                    -- σε ποια έκδοση χρεώθηκε (NULL = εκκρεμεί)
  paid_at date, fund_account_id uuid,        -- από ποιο ταμείο πληρώθηκε
  attachment_url text, created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expense_overrides (             -- MANUAL/SUBSET/εξαιρέσεις ανά δαπάνη
  expense_id uuid NOT NULL REFERENCES expenses ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units,
  fixed_amount numeric(14,2), weight numeric(12,4), excluded boolean NOT NULL DEFAULT false,
  PRIMARY KEY (expense_id, unit_id)
);

CREATE TABLE recurring_expenses (            -- πρότυπα επαναλαμβανόμενων
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  category_id uuid NOT NULL REFERENCES expense_categories, supplier_id uuid REFERENCES suppliers,
  amount numeric(14,2), frequency text NOT NULL,  -- MONTHLY|QUARTERLY|YEARLY
  next_run date, template jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true
);

-- ---------- Μετρήσεις (ωρομέτρηση / θερμιδομέτρηση / υδρόμετρα) ----------
CREATE TABLE meter_readings (
  id uuid PRIMARY KEY, unit_id uuid NOT NULL REFERENCES units,
  meter_type text NOT NULL,                  -- HEAT_HOURS|BOILER_HOURS|HEAT_KWH|WATER_M3
  period_from date NOT NULL, period_to date NOT NULL,
  value numeric(14,3) NOT NULL, note text
);

-- ---------- Καύσιμο ----------
CREATE TABLE fuel_purchases (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  purchase_date date NOT NULL, liters numeric(12,2) NOT NULL,
  price_per_liter numeric(10,4) NOT NULL, total_amount numeric(14,2) NOT NULL,
  supplier_id uuid REFERENCES suppliers, expense_id uuid REFERENCES expenses
);
CREATE TABLE fuel_readings (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  reading_date date NOT NULL, liters_in_tank numeric(12,2) NOT NULL
);

-- ---------- Περίοδοι & χρεώσεις ----------
CREATE TABLE billing_periods (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  code text NOT NULL,                        -- '2026-01' ή '2026-Q1'
  period_from date NOT NULL, period_to date NOT NULL,   -- «από–έως μήνες»
  label text, issue_date date, due_date date,
  status text NOT NULL DEFAULT 'DRAFT',      -- DRAFT|REVIEW|ISSUED|CLOSED|CANCELLED
  month_label text,                          -- 'ΑΠΡ-ΜΑΙΟΣ-ΙΟΥΝ 2026' (auto από το από–έως, με override)
  announcement text,                         -- πλαίσιο ΑΝΑΚΟΙΝΩΣΗ
  heating_fixed_amount numeric(14,2),        -- [Δ10] πάγιο θέρμανσης: καρφωτό ποσό...
  heating_fixed_pct numeric(5,2),            -- ...ή καρφωτό ποσοστό, όπως το δίνει ο διαχειριστής
  reserve_contribution numeric(14,2),        -- [Δ12] εισφορά αποθεματικού που ορίζει ο διαχειριστής
  reserve_opening numeric(14,2),             -- αυτόματα από τις κινήσεις αποθεματικού
  reserve_closing numeric(14,2),
  rounding_unit_id uuid REFERENCES units,    -- [Δ14] μεγαλύτερα χιλιοστά, εκ περιτροπής σε ισοβαθμία
  snapshot jsonb,                            -- πάγωμα χιλιοστών/ενοίκων/ρυθμίσεων κατά την έκδοση
  totals jsonb, issued_by uuid REFERENCES users, issued_at timestamptz,
  UNIQUE (building_id, code)
);

CREATE TABLE charges (                       -- μία γραμμή ανά (έκδοση, διαμέρισμα, δαπάνη)
  id uuid PRIMARY KEY,
  billing_period_id uuid NOT NULL REFERENCES billing_periods ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units,
  expense_id uuid REFERENCES expenses,       -- NULL για εισφορά αποθεματικού/ατομική χρέωση
  cost_group_id uuid REFERENCES cost_groups,   -- στήλη του εντύπου
  charge_kind text NOT NULL DEFAULT 'EXPENSE', -- EXPENSE|RESERVE|INDIVIDUAL|ROUNDING|ADJUSTMENT|PREVIOUS_BALANCE
  description text,
  amount numeric(14,2) NOT NULL,
  tenant_amount numeric(14,2) NOT NULL DEFAULT 0,
  owner_amount  numeric(14,2) NOT NULL DEFAULT 0,
  method text, basis jsonb                   -- {mills:45.5,total:1000,factor:0.0455,...} → «γιατί πληρώνω αυτό»
);

CREATE TABLE unit_statements (               -- σύνολα ανά διαμέρισμα & έκδοση (ειδοποιητήριο)
  id uuid PRIMARY KEY,
  billing_period_id uuid NOT NULL REFERENCES billing_periods ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units,
  tenant_person_id uuid REFERENCES persons, owner_person_id uuid REFERENCES persons,
  period_total numeric(14,2) NOT NULL, previous_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_due numeric(14,2) NOT NULL, paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_code text,                         -- αιτιολογία κατάθεσης, π.χ. 'ΚΤ12-Α1-2026-01'
  pdf_url text, sent_at timestamptz,
  UNIQUE (billing_period_id, unit_id)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  unit_id uuid NOT NULL REFERENCES units, person_id uuid REFERENCES persons,
  paid_at date NOT NULL, amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL,                      -- CASH|BANK|EBANKING|STANDING_ORDER|OTHER  [Δ3: χωρίς PSP στο MVP]
  reference text, fund_account_id uuid, note text,
  created_by uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_allocations (           -- συμψηφισμός πληρωμής σε εκδόσεις
  payment_id uuid NOT NULL REFERENCES payments ON DELETE CASCADE,
  unit_statement_id uuid NOT NULL REFERENCES unit_statements,
  amount numeric(14,2) NOT NULL,
  PRIMARY KEY (payment_id, unit_statement_id)
);

-- ---------- Ταμεία & αποθεματικό ----------
CREATE TABLE fund_accounts (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  kind text NOT NULL,                        -- OPERATING (ταμείο διαχείρισης) | RESERVE (αποθεματικό)  [Δ8]
  name text NOT NULL, iban text,
  target_amount numeric(14,2),               -- στόχος αποθεματικού
  min_alert_amount numeric(14,2)
);

CREATE TABLE fund_transactions (             -- οι +/- κινήσεις
  id uuid PRIMARY KEY, fund_account_id uuid NOT NULL REFERENCES fund_accounts,
  tx_date date NOT NULL,
  tx_type text NOT NULL,                     -- CONTRIBUTION|COLLECTION|INTEREST|EXTRA_CONTRIBUTION|
                                             -- EXPENSE_PAYMENT|WITHDRAWAL|TRANSFER|ADJUSTMENT|OPENING_BALANCE
  amount numeric(14,2) NOT NULL,             -- ΠΡΟΣΗΜΑΣΜΕΝΟ: + εισροή, − εκροή
  description text NOT NULL,
  expense_id uuid REFERENCES expenses, payment_id uuid REFERENCES payments,
  billing_period_id uuid REFERENCES billing_periods,
  counter_account_id uuid REFERENCES fund_accounts,  -- για TRANSFER
  decision_ref text,                         -- απόφαση ΓΣ (υποχρεωτικό σε WITHDRAWAL)
  attachment_url text, created_by uuid REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Λοιπά ----------
CREATE TABLE announcements (
  id uuid PRIMARY KEY, building_id uuid NOT NULL REFERENCES buildings,
  title text NOT NULL, body text NOT NULL, published_at timestamptz,
  audience text NOT NULL DEFAULT 'ALL',      -- ALL|OWNERS|TENANTS
  created_by uuid REFERENCES users
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, organization_id uuid, building_id uuid,
  user_id uuid, action text NOT NULL, entity text NOT NULL, entity_id uuid,
  diff jsonb, ip inet, created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Ενδεικτικά indexes / constraints ----------
CREATE INDEX ON charges (billing_period_id, unit_id);
CREATE INDEX ON expenses (building_id, expense_date);
CREATE INDEX ON fund_transactions (fund_account_id, tx_date);
CREATE INDEX ON unit_occupancies (unit_id, valid_from, valid_to);
-- Μία ενεργή σχέση ανά (unit, role) σε κάθε χρονική στιγμή:
-- EXCLUDE USING gist (unit_id WITH =, role WITH =, daterange(valid_from, valid_to) WITH &&)
