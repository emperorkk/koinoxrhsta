/**
 * Πραγματικά δεδομένα από την έκδοση ΑΠΡ-ΜΑΙΟΣ-ΙΟΥΝ 2026 της πολυκατοικίας
 * ΑΓΙΟΥ ΝΙΚΟΛΑΟΥ 3, ΜΑΡΟΥΣΙ (υπόδειγμα Apical Service, κωδικός 000335).
 *
 * Τα ονόματα ενοίκων δεν χρειάζονται για τον υπολογισμό και δεν αποθηκεύονται εδώ.
 * Γενικό σύνολο εντύπου: 1.057,51 €.
 */
import type { Category, Expense, PeriodInput, Unit } from '../types.js';

export const units: Unit[] = [
  { code: 'Α1', mills: { COMMON: 70, ELEVATOR: 50, HEATING: 70 } },
  { code: 'Α2', mills: { COMMON: 133, ELEVATOR: 85, HEATING: 133 } },
  { code: 'Β1', mills: { COMMON: 70, ELEVATOR: 70, HEATING: 70 } },
  { code: 'Β2', mills: { COMMON: 133, ELEVATOR: 130, HEATING: 133 } },
  { code: 'Γ1', mills: { COMMON: 70, ELEVATOR: 85, HEATING: 70 } },
  { code: 'Γ2', mills: { COMMON: 133, ELEVATOR: 170, HEATING: 133 } },
  { code: 'Δ1', mills: { COMMON: 70, ELEVATOR: 100, HEATING: 70 } },
  { code: 'Δ2', mills: { COMMON: 133, ELEVATOR: 200, HEATING: 133 } },
  { code: 'ΔΩΜ', mills: { COMMON: 15, ELEVATOR: 20, HEATING: 15 } },
  { code: 'ΙΣ1', mills: { COMMON: 74, ELEVATOR: 40, HEATING: 74 } },
  { code: 'ΙΣ2', mills: { COMMON: 99, ELEVATOR: 50, HEATING: 99 } },
];

export const categories: Category[] = [
  { code: 'DEH', name: 'ΔΕΗ ΚΟΙΝΟΧΡΗΣΤΩΝ', groupCode: 'COMMON', tableCode: 'COMMON', method: 'BY_MILLS' },
  { code: 'WATER', name: 'ΝΕΡΟ ΚΟΙΝΟΧΡΗΣΤΩΝ', groupCode: 'COMMON', tableCode: 'COMMON', method: 'BY_MILLS' },
  { code: 'FIRE', name: 'ΠΥΡΟΣΒΕΣΤΗΡΑΣ', groupCode: 'COMMON', tableCode: 'COMMON', method: 'BY_MILLS' },
  { code: 'MISC', name: 'ΑΝΑΛΩΣΙΜΑ / ΜΙΚΡΟΕΠΙΣΚΕΥΕΣ', groupCode: 'COMMON', tableCode: 'COMMON', method: 'BY_MILLS' },
  {
    code: 'CLEANING',
    name: 'ΣΥΝΕΡΓΕΙΟ ΚΑΘΑΡΙΣΜΟΥ',
    groupCode: 'COMMON',
    tableCode: 'COMMON',
    method: 'BY_MILLS',
    closedCoefficient: 0.5,
  },
  {
    code: 'ELEVATOR',
    name: 'ΣΥΝΤΗΡΗΣΗ ΑΝΕΛΚΥΣΤΗΡΑ',
    groupCode: 'ELEVATOR',
    tableCode: 'ELEVATOR',
    method: 'BY_MILLS',
    closedCoefficient: 0.5,
  },
  { code: 'ISSUANCE', name: 'ΕΚΔΟΣΗ ΚΟΙΝΟΧΡΗΣΤΩΝ', groupCode: 'SPECIAL', tableCode: 'COMMON', method: 'BY_MILLS' },
  {
    code: 'RESERVE',
    name: 'ΕΙΣΦΟΡΑ ΑΠΟΘΕΜΑΤΙΚΟΥ',
    groupCode: 'OWNERS',
    tableCode: 'COMMON',
    method: 'BY_MILLS',
    ownerPct: 100,
  },
];

export const expenses: Expense[] = [
  { id: 'e1', categoryCode: 'DEH', description: 'ΔΕΗ ΜΑΙΟΥ', amount: 16_700 },
  { id: 'e2', categoryCode: 'DEH', description: 'ΔΕΗ ΙΟΥΝΙΟΥ', amount: 7_400 },
  { id: 'e3', categoryCode: 'WATER', description: 'ΝΕΡΟ ΚΟΙΝΟΧΡΗΣΤΩΝ', amount: 1_473 },
  { id: 'e4', categoryCode: 'FIRE', description: 'ΠΥΡΟΣΒΕΣΤΗΡΑΣ', amount: 1_900 },
  { id: 'e5', categoryCode: 'MISC', description: 'ΛΑΣΤΙΧΟ ΠΟΤΙΣΜΑΤΟΣ', amount: 2_000 },
  { id: 'e6', categoryCode: 'MISC', description: 'ΑΠΟΦΡΑΚΤΙΚΟ ΣΩΛΗΝΩΝ', amount: 1_000 },
  { id: 'e7', categoryCode: 'CLEANING', description: 'ΣΥΝΕΡΓΕΙΟ ΚΑΘ/ΣΜΟΥ ΑΠΡΙΛΙΟΥ', amount: 6_000 },
  { id: 'e8', categoryCode: 'CLEANING', description: 'ΣΥΝΕΡΓΕΙΟ ΚΑΘ/ΣΜΟΥ ΜΑΙΟΥ', amount: 4_250 },
  { id: 'e9', categoryCode: 'CLEANING', description: 'ΣΥΝΕΡΓΕΙΟ ΚΑΘ/ΣΜΟΥ ΙΟΥΝΙΟΥ', amount: 8_500 },
  { id: 'e10', categoryCode: 'ELEVATOR', description: 'ΣΥΝΤΗΡΗΣΗ 51,76*3', amount: 15_528 },
  { id: 'e11', categoryCode: 'ISSUANCE', description: 'ΕΚΔΟΣΗ ΚΟΙΝΟΧΡΗΣΤΩΝ', amount: 1_000 },
  { id: 'e12', categoryCode: 'RESERVE', description: 'ΕΙΣΦΟΡΑ ΑΠΟΘΕΜΑΤΙΚΟΥ', amount: 40_000 },
];

export const period: PeriodInput = { units, categories, expenses };

/** Τα τυπωμένα ποσά του υποδείγματος, σε λεπτά: [ΚΟΙΝ/ΣΤΑ, ΑΣΑΝΣΕΡ, ΕΙΔΙΚΕΣ, ΙΔΙΟΚΤΗΤΩΝ]. */
export const expectedColumns: Record<string, [number, number, number, number]> = {
  Α1: [3_446, 776, 70, 2_800],
  Α2: [6_547, 1_320, 133, 5_320],
  Β1: [3_446, 1_087, 70, 2_800],
  Β2: [6_547, 2_019, 133, 5_320],
  Γ1: [3_446, 1_320, 70, 2_800],
  Γ2: [6_547, 2_640, 133, 5_320],
  Δ1: [3_446, 1_553, 70, 2_800],
  Δ2: [6_547, 3_106, 133, 5_320],
  ΔΩΜ: [738, 311, 15, 600],
  ΙΣ1: [3_643, 621, 74, 2_960],
  ΙΣ2: [4_873, 776, 99, 3_960],
};
