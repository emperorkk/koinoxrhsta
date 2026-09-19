import { describe, expect, it } from 'vitest';
import { allocatePeriod } from '../allocation.js';
import { largestRemainder, halfUpShare } from '../rounding.js';
import { categories, expectedColumns, expenses, period, units } from './apical.fixture.js';

const GROUPS = ['COMMON', 'ELEVATOR', 'SPECIAL', 'OWNERS'] as const;

describe('υπόδειγμα Apical Service — ΑΠΡ-ΜΑΙΟΣ-ΙΟΥΝ 2026', () => {
  const result = allocatePeriod(period);
  const byCode = new Map(result.units.map((u) => [u.unitCode, u]));

  it('τα χιλιοστά κάθε πίνακα αθροίζουν σε 1000', () => {
    for (const table of ['COMMON', 'ELEVATOR', 'HEATING']) {
      const sum = units.reduce((a, u) => a + (u.mills[table] ?? 0), 0);
      expect(sum, table).toBe(1000);
    }
  });

  it('τα σύνολα των ομάδων ισούνται με τις δαπάνες του εντύπου', () => {
    expect(result.groupTotals).toEqual({
      COMMON: 49_223,
      ELEVATOR: 15_528,
      SPECIAL: 1_000,
      OWNERS: 40_000,
    });
    expect(result.grandTotal).toBe(105_751); // 1.057,51 €
  });

  it.each(Object.entries(expectedColumns))(
    'διαμέρισμα %s — τα κελιά ταυτίζονται με το τυπωμένο έντυπο',
    (code, expected) => {
      const statement = byCode.get(code)!;
      const actual = GROUPS.map((g) => statement.columns[g] ?? 0);
      expect(actual).toEqual(expected);
    },
  );

  it('το άθροισμα των γενικών συνόλων ισούται ΑΚΡΙΒΩΣ με το γενικό σύνολο δαπανών', () => {
    const sum = result.units.reduce((a, u) => a + u.total, 0);
    expect(sum).toBe(result.grandTotal);
  });

  it('η διαφορά στρογγυλοποίησης είναι −0,04 € και πάει στο Δ2 (Δ14)', () => {
    expect(result.roundingAmount).toBe(-4);
    expect(result.roundingUnitCode).toBe('Δ2');
    expect(byCode.get('Δ2')!.rounding).toBe(-4);
    expect(byCode.get('Δ2')!.total).toBe(15_102);
  });

  it('ίδια χιλιοστά ⇒ ίδιο ποσό στην ίδια στήλη', () => {
    const seventyMills = ['Α1', 'Β1', 'Γ1', 'Δ1'].map((c) => byCode.get(c)!.columns.COMMON);
    expect(new Set(seventyMills).size).toBe(1);
  });

  describe('ειδοποιητήριο — οι αναλυτικές γραμμές αθροίζουν στο κελί (Δ19)', () => {
    it.each(units.map((u) => u.code))('διαμέρισμα %s', (code) => {
      const statement = byCode.get(code)!;
      for (const group of GROUPS) {
        const lines = statement.lines
          .filter((l) => l.groupCode === group)
          .reduce((a, l) => a + l.amount, 0);
        expect(lines, `${code}/${group}`).toBe(statement.columns[group] ?? 0);
      }
    });

    it('ΔΩΜ: οι εννέα γραμμές κοινοχρήστων αθροίζουν 7,38 € (όχι 7,40 €)', () => {
      const lines = byCode
        .get('ΔΩΜ')!
        .lines.filter((l) => l.groupCode === 'COMMON')
        .map((l) => l.amount);
      expect(lines).toEqual([250, 111, 22, 29, 30, 15, 90, 64, 127]);
      expect(lines.reduce((a, b) => a + b, 0)).toBe(738);
    });

    it('Β2: οι γραμμές ταυτίζονται με το mockup του ειδοποιητηρίου', () => {
      const lines = byCode
        .get('Β2')!
        .lines.filter((l) => l.groupCode === 'COMMON')
        .map((l) => l.amount);
      expect(lines).toEqual([2_221, 984, 196, 253, 266, 133, 798, 565, 1_131]);
      expect(lines.reduce((a, b) => a + b, 0)).toBe(6_547);
    });

    it('η βάση επιμερισμού τυπώνεται ως «× χιλιοστά/σύνολο»', () => {
      const line = byCode.get('Β2')!.lines.find((l) => l.expenseId === 'e1')!;
      expect(line.basis).toBe('× 133/1000');
      expect(line.description).toBe('ΔΕΗ ΜΑΙΟΥ');
      expect(line.expenseAmount).toBe(16_700);
    });
  });

  describe('μερίδιο ενοικιαστή / ιδιοκτήτη (Δ5, Δ7)', () => {
    it('Β2: 86,99 € ενοικιαστής και 53,20 € ιδιοκτήτης', () => {
      const statement = byCode.get('Β2')!;
      expect(statement.tenantTotal).toBe(8_699);
      expect(statement.ownerTotal).toBe(5_320);
      expect(statement.tenantTotal + statement.ownerTotal).toBe(statement.total);
    });

    it('το αποθεματικό βαρύνει εξ ολοκλήρου τον ιδιοκτήτη', () => {
      for (const statement of result.units) {
        const reserve = statement.lines.filter((l) => l.categoryCode === 'RESERVE');
        expect(reserve.every((l) => l.tenantAmount === 0)).toBe(true);
      }
    });

    it('σε κενό διαμέρισμα όλα περνούν στον ιδιοκτήτη', () => {
      const vacant = allocatePeriod({
        ...period,
        units: units.map((u) => (u.code === 'Α1' ? { ...u, hasTenant: false } : u)),
      });
      const statement = vacant.units.find((u) => u.unitCode === 'Α1')!;
      expect(statement.tenantTotal).toBe(0);
      expect(statement.ownerTotal).toBe(statement.total);
    });
  });

  describe('κλειστό διαμέρισμα (Δ16)', () => {
    const closed = allocatePeriod({
      ...period,
      units: units.map((u) => (u.code === 'Β1' ? { ...u, isClosed: true } : u)),
    });
    const byCodeClosed = new Map(closed.units.map((u) => [u.unitCode, u]));

    it('συμμετέχει με τα μισά χιλιοστά στον ανελκυστήρα', () => {
      // 155,28 × 35/965 = 5,63 € (αντί 10,87 €)
      expect(byCodeClosed.get('Β1')!.columns.ELEVATOR).toBe(563);
    });

    it('το υπόλοιπο μισό ανακατανέμεται — τα σύνολα παραμένουν ακέραια', () => {
      const sum = closed.units.reduce((a, u) => a + u.total, 0);
      expect(sum).toBe(closed.grandTotal);
      expect(closed.grandTotal).toBe(105_751);
    });

    it('χρεώνεται κανονικά εκεί που δεν ισχύει ο συντελεστής (ΔΕΗ)', () => {
      const deh = byCodeClosed.get('Β1')!.lines.filter((l) => l.categoryCode === 'DEH');
      expect(deh.reduce((a, l) => a + l.amount, 0)).toBe(
        byCode.get('Β1')!.lines.filter((l) => l.categoryCode === 'DEH').reduce((a, l) => a + l.amount, 0),
      );
    });
  });

  it('η στρογγυλοποίηση εναλλάσσεται εκ περιτροπής σε πλήρη ισοβαθμία', () => {
    const equal = {
      units: ['Α1', 'Α2', 'Α3'].map((code) => ({ code, mills: { COMMON: 333.3334 } })),
      categories: categories.filter((c) => c.code === 'DEH'),
      expenses: [{ id: 'x', categoryCode: 'DEH', description: 'ΔΕΗ', amount: 10_000 }],
    };
    const first = allocatePeriod(equal);
    const second = allocatePeriod({ ...equal, lastRoundingUnitCode: first.roundingUnitCode });
    expect(first.roundingUnitCode).toBeDefined();
    expect(second.roundingUnitCode).not.toBe(first.roundingUnitCode);
  });
});

describe('αριθμητική στρογγυλοποίησης', () => {
  it('halfUpShare στρογγυλοποιεί το μισό προς τα πάνω', () => {
    expect(halfUpShare(49_223, 74, 1_000)).toBe(3_643); // 36,425 → 36,43
    expect(halfUpShare(49_223, 15, 1_000)).toBe(738); // 7,38345 → 7,38
  });

  it('largestRemainder αθροίζει πάντα στο σύνολο', () => {
    for (const total of [1, 7, 100, 738, 6_547, 105_751]) {
      const parts = largestRemainder(total, [16_700, 7_400, 1_473, 1_900, 2_000, 1_000]);
      expect(parts.reduce((a, b) => a + b, 0), `σύνολο ${total}`).toBe(total);
    }
  });

  it('χειρίζεται αρνητικά σύνολα (πιστωτικά)', () => {
    const parts = largestRemainder(-503, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-503);
  });

  it('μηδενικά βάρη δεν σπάνε τον υπολογισμό', () => {
    expect(largestRemainder(100, [0, 0])).toEqual([0, 0]);
    expect(halfUpShare(100, 5, 0)).toBe(0);
  });
});
