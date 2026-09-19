/**
 * Τύποι της μηχανής κατανομής κοινοχρήστων.
 *
 * Όλα τα χρηματικά ποσά είναι **ακέραια λεπτά** (Cents). Καμία πράξη δεν γίνεται
 * σε δεκαδικούς — η στρογγυλοποίηση συμβαίνει μόνο στα σημεία που ορίζει ο
 * σχεδιασμός (docs/00-apofaseis.md, Δ14 & Δ19).
 */

export type Cents = number;

/** Μέθοδος επιμερισμού μιας κατηγορίας δαπάνης. */
export type AllocationMethod =
  | 'BY_MILLS' // αναλογικά με τα χιλιοστά ενός πίνακα
  | 'EQUAL' // ισομερώς στις ενεργές ιδιοκτησίες
  | 'BY_HOURS' // με μετρήσεις (ωρομέτρηση / θερμιδομέτρηση)
  | 'FIXED_PER_UNIT'; // καρφωτό ποσό σε συγκεκριμένο διαμέρισμα (Δ15)

/** Πώς υπολογίζεται η συμμετοχή του ιδιοκτήτη (Δ5). */
export type OwnerShareBasis = 'PRORATA' | 'LUMP_SUM';

/** Τι γίνεται όταν δεν υπάρχει ενεργός ενοικιαστής (Δ5). */
export type VacantBehavior = 'OWNER_PAYS_ALL' | 'COEFFICIENT' | 'EXEMPT';

export interface Unit {
  code: string;
  /** χιλιοστά ανά πίνακα κατανομής: { COMMON: 70, ELEVATOR: 50, HEATING: 70 } */
  mills: Record<string, number>;
  /** κλειστό διαμέρισμα — μισή συμμετοχή όπου closedCoefficient < 1 (Δ16) */
  isClosed?: boolean;
  /** false όταν το διαμέρισμα είναι κενό· τότε εφαρμόζεται το vacantBehavior */
  hasTenant?: boolean;
  personsCount?: number;
  areaSqm?: number;
}

export interface Category {
  code: string;
  name: string;
  /** ομάδα δαπανών = block εντύπου & στήλη πίνακα (Δ13) */
  groupCode: string;
  tableCode?: string;
  method: AllocationMethod;
  meterType?: string;
  /** ποσοστό της δαπάνης που βαρύνει τον ιδιοκτήτη, 0–100 (Δ5) */
  ownerPct?: number;
  ownerShareBasis?: OwnerShareBasis;
  ownerLumpAmount?: Cents;
  /** 0.5 σε ανελκυστήρα & καθαρισμό για κλειστά διαμερίσματα (Δ16) */
  closedCoefficient?: number;
  vacantBehavior?: VacantBehavior;
}

/** Δαπάνη: κατηγορία + αιτιολογία + ποσό (Δ18). */
export interface Expense {
  id: string;
  categoryCode: string;
  /** η «αιτιολογία» — τυπώνεται αυτούσια στα έντυπα */
  description: string;
  amount: Cents;
  /** μόνο για FIXED_PER_UNIT: σε ποιο διαμέρισμα χρεώνεται */
  unitCode?: string;
}

export interface MeterReading {
  unitCode: string;
  meterType: string;
  value: number;
}

export interface PeriodInput {
  units: Unit[];
  categories: Category[];
  expenses: Expense[];
  meters?: MeterReading[];
  /** πίνακας που κρίνει ποιο διαμέρισμα σηκώνει τη διαφορά στρογγυλοποίησης (Δ14) */
  roundingTableCode?: string;
  /** το διαμέρισμα που σήκωσε τη διαφορά στην προηγούμενη έκδοση — για την εκ περιτροπής εναλλαγή */
  lastRoundingUnitCode?: string;
}

export interface ChargeLine {
  unitCode: string;
  expenseId: string;
  categoryCode: string;
  groupCode: string;
  /** η αιτιολογία της δαπάνης */
  description: string;
  /** το συνολικό ποσό της δαπάνης (για τη στήλη «ΣΥΝΟΛΙΚΗ ΔΑΠΑΝΗ») */
  expenseAmount: Cents;
  /** πώς προέκυψε, π.χ. «× 133/1000» (Δ19) */
  basis: string;
  amount: Cents;
  tenantAmount: Cents;
  ownerAmount: Cents;
}

export interface UnitStatement {
  unitCode: string;
  /** ποσό ανά ομάδα/στήλη εντύπου */
  columns: Record<string, Cents>;
  /** στήλη ΣΤΡΟΓΓ (Δ14) */
  rounding: Cents;
  total: Cents;
  tenantTotal: Cents;
  ownerTotal: Cents;
  lines: ChargeLine[];
}

export interface PeriodResult {
  units: UnitStatement[];
  groupTotals: Record<string, Cents>;
  grandTotal: Cents;
  roundingUnitCode?: string;
  roundingAmount: Cents;
}
