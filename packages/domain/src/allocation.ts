import { halfUpShare, largestRemainder } from './rounding.js';
import type {
  Category,
  Cents,
  ChargeLine,
  Expense,
  PeriodInput,
  PeriodResult,
  Unit,
  UnitStatement,
} from './types.js';

/**
 * Μηχανή κατανομής κοινοχρήστων.
 *
 * Δύο επίπεδα υπολογισμού, όπως ορίζει η Δ19:
 *
 *   Επίπεδο 1 — το κελί της συγκεντρωτικής προκύπτει από το **σύνολο** των
 *               δαπανών που μοιράζονται τον ίδιο κανόνα επιμερισμού, με μία
 *               στρογγυλοποίηση. Ίδια χιλιοστά ⇒ ίδιο ποσό.
 *   Επίπεδο 2 — το κελί επιμερίζεται στις επιμέρους δαπάνες (τις γραμμές του
 *               ειδοποιητηρίου) με μέθοδο μεγαλύτερου υπολοίπου, ώστε οι
 *               γραμμές να αθροίζουν **ακριβώς** στο κελί.
 *
 * Η υπολειπόμενη διαφορά όλων των στηλών καταλήγει στη στήλη ΣΤΡΟΓΓ ενός
 * διαμερίσματος (Δ14), ώστε το γενικό σύνολο να ισούται ακριβώς με το σύνολο
 * των δαπανών.
 */
export function allocatePeriod(input: PeriodInput): PeriodResult {
  const categories = new Map(input.categories.map((c) => [c.code, c]));
  const statements = new Map<string, UnitStatement>(
    input.units.map((u) => [
      u.code,
      {
        unitCode: u.code,
        columns: {},
        rounding: 0,
        total: 0,
        tenantTotal: 0,
        ownerTotal: 0,
        lines: [],
      },
    ]),
  );

  const groupTotals: Record<string, Cents> = {};
  for (const expense of input.expenses) {
    const category = requireCategory(categories, expense.categoryCode);
    groupTotals[category.groupCode] = (groupTotals[category.groupCode] ?? 0) + expense.amount;
  }

  for (const partition of partitionExpenses(input.expenses, categories)) {
    allocatePartition(partition, input, statements);
  }

  const grandTotal = Object.values(groupTotals).reduce((a, b) => a + b, 0);
  const allocated = [...statements.values()].reduce((a, s) => a + s.total, 0);
  const roundingAmount = grandTotal - allocated;

  let roundingUnitCode: string | undefined;
  if (roundingAmount !== 0) {
    roundingUnitCode = pickRoundingUnit(input, statements);
    const target = statements.get(roundingUnitCode)!;
    target.rounding = roundingAmount;
    target.total += roundingAmount;
    const unit = input.units.find((u) => u.code === roundingUnitCode)!;
    if (unit.hasTenant === false) target.ownerTotal += roundingAmount;
    else target.tenantTotal += roundingAmount;
  }

  return {
    units: input.units.map((u) => statements.get(u.code)!),
    groupTotals,
    grandTotal,
    roundingUnitCode,
    roundingAmount,
  };
}

/* ------------------------------------------------------------------ */

interface Partition {
  category: Category;
  expenses: Expense[];
  subtotal: Cents;
}

/**
 * Ομαδοποιεί τις δαπάνες που μοιράζονται **ακριβώς τον ίδιο κανόνα επιμερισμού**.
 * Δύο κατηγορίες της ίδιας στήλης (π.χ. ΔΕΗ και ΚΑΘΑΡΙΣΜΟΣ στα ΚΟΙΝΟΧΡΗΣΤΑ)
 * χωρίζονται μόνο αν διαφέρουν σε κάτι που αλλάζει τα βάρη — π.χ. στον
 * συντελεστή κλειστών.
 */
function partitionExpenses(
  expenses: readonly Expense[],
  categories: Map<string, Category>,
): Partition[] {
  const byKey = new Map<string, Partition>();
  for (const expense of expenses) {
    const category = requireCategory(categories, expense.categoryCode);
    const key = [
      category.groupCode,
      category.method,
      category.tableCode ?? '',
      category.meterType ?? '',
      category.closedCoefficient ?? 1,
      category.ownerPct ?? 0,
      category.ownerShareBasis ?? 'PRORATA',
      category.ownerLumpAmount ?? 0,
      category.vacantBehavior ?? 'OWNER_PAYS_ALL',
      category.method === 'FIXED_PER_UNIT' ? expense.id : '',
    ].join('|');

    const existing = byKey.get(key);
    if (existing) {
      existing.expenses.push(expense);
      existing.subtotal += expense.amount;
    } else {
      byKey.set(key, { category, expenses: [expense], subtotal: expense.amount });
    }
  }
  return [...byKey.values()];
}

function allocatePartition(
  partition: Partition,
  input: PeriodInput,
  statements: Map<string, UnitStatement>,
): void {
  const { category, expenses, subtotal } = partition;
  const weights = input.units.map((unit) => weightOf(unit, category, input, expenses));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return;

  input.units.forEach((unit, i) => {
    const weight = weights[i]!;
    if (weight === 0) return;

    // Επίπεδο 1: το κελί της στήλης.
    const cell = halfUpShare(subtotal, weight, totalWeight);
    // Επίπεδο 2: οι γραμμές του ειδοποιητηρίου αθροίζουν ακριβώς στο κελί.
    const lineAmounts = largestRemainder(
      cell,
      expenses.map((e) => e.amount),
    );

    const statement = statements.get(unit.code)!;
    expenses.forEach((expense, j) => {
      const amount = lineAmounts[j]!;
      const { tenantAmount, ownerAmount } = splitOwnerTenant(amount, category, unit);
      statement.lines.push({
        unitCode: unit.code,
        expenseId: expense.id,
        categoryCode: category.code,
        groupCode: category.groupCode,
        description: expense.description,
        expenseAmount: expense.amount,
        basis: basisLabel(category, unit, weight, totalWeight),
        amount,
        tenantAmount,
        ownerAmount,
      });
      statement.tenantTotal += tenantAmount;
      statement.ownerTotal += ownerAmount;
    });

    statement.columns[category.groupCode] = (statement.columns[category.groupCode] ?? 0) + cell;
    statement.total += cell;
  });
}

function weightOf(
  unit: Unit,
  category: Category,
  input: PeriodInput,
  expenses: readonly Expense[],
): number {
  switch (category.method) {
    case 'BY_MILLS': {
      const mills = unit.mills[category.tableCode ?? ''] ?? 0;
      const coefficient = unit.isClosed ? (category.closedCoefficient ?? 1) : 1;
      return mills * coefficient;
    }
    case 'EQUAL':
      return 1;
    case 'BY_HOURS':
      return (
        input.meters?.find((m) => m.unitCode === unit.code && m.meterType === category.meterType)
          ?.value ?? 0
      );
    case 'FIXED_PER_UNIT':
      return expenses.some((e) => e.unitCode === unit.code) ? 1 : 0;
  }
}

/** Διαχωρισμός σε μερίδιο ενοικιαστή / ιδιοκτήτη με τον κανόνα της κατηγορίας (Δ5). */
function splitOwnerTenant(
  amount: Cents,
  category: Category,
  unit: Unit,
): { tenantAmount: Cents; ownerAmount: Cents } {
  const basis = category.ownerShareBasis ?? 'PRORATA';
  let ownerAmount =
    basis === 'LUMP_SUM'
      ? Math.min(category.ownerLumpAmount ?? 0, amount)
      : halfUpShare(amount, category.ownerPct ?? 0, 100);
  let tenantAmount = amount - ownerAmount;

  if (unit.hasTenant === false) {
    const behavior = category.vacantBehavior ?? 'OWNER_PAYS_ALL';
    if (behavior !== 'OWNER_PAYS_ALL') {
      throw new Error(
        `Η συμπεριφορά κενού διαμερίσματος «${behavior}» δεν υποστηρίζεται ακόμη (Φάση 2).`,
      );
    }
    ownerAmount += tenantAmount;
    tenantAmount = 0;
  }
  return { tenantAmount, ownerAmount };
}

/** Το κείμενο της στήλης «ΒΑΣΗ ΕΠΙΜΕΡΙΣΜΟΥ» του ειδοποιητηρίου (Δ19). */
function basisLabel(
  category: Category,
  unit: Unit,
  weight: number,
  totalWeight: number,
): string {
  switch (category.method) {
    case 'BY_MILLS': {
      const label = `× ${formatNumber(weight)}/${formatNumber(totalWeight)}`;
      return unit.isClosed && (category.closedCoefficient ?? 1) < 1
        ? `${label} (κλειστό, ${Math.round((category.closedCoefficient ?? 1) * 100)}%)`
        : label;
    }
    case 'EQUAL':
      return `1/${formatNumber(totalWeight)} διαμερίσματα`;
    case 'BY_HOURS':
      return `${formatNumber(weight)} / ${formatNumber(totalWeight)} ώρες`;
    case 'FIXED_PER_UNIT':
      return 'ατομική χρέωση';
  }
}

/**
 * Ποιο διαμέρισμα σηκώνει τη διαφορά στρογγυλοποίησης (Δ14):
 * τα μεγαλύτερα χιλιοστά κοινοχρήστων· σε ισοβαθμία το μεγαλύτερο σύνολο
 * περιόδου· αν και εκεί υπάρχει ισοβαθμία, εκ περιτροπής ανά έκδοση.
 */
function pickRoundingUnit(input: PeriodInput, statements: Map<string, UnitStatement>): string {
  const table = input.roundingTableCode ?? 'COMMON';
  const ranked = [...input.units].sort((a, b) => {
    const millsDiff = (b.mills[table] ?? 0) - (a.mills[table] ?? 0);
    if (millsDiff !== 0) return millsDiff;
    const totalDiff = statements.get(b.code)!.total - statements.get(a.code)!.total;
    if (totalDiff !== 0) return totalDiff;
    return a.code.localeCompare(b.code, 'el');
  });

  const top = ranked[0]!;
  const tied = ranked.filter(
    (u) =>
      (u.mills[table] ?? 0) === (top.mills[table] ?? 0) &&
      statements.get(u.code)!.total === statements.get(top.code)!.total,
  );
  if (tied.length === 1 || !input.lastRoundingUnitCode) return top.code;

  const previous = tied.findIndex((u) => u.code === input.lastRoundingUnitCode);
  return tied[(previous + 1) % tied.length]!.code;
}

function requireCategory(categories: Map<string, Category>, code: string): Category {
  const category = categories.get(code);
  if (!category) throw new Error(`Άγνωστη κατηγορία δαπάνης: ${code}`);
  return category;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}
