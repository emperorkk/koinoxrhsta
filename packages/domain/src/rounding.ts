/**
 * Αριθμητική στρογγυλοποίησης.
 *
 * Όλες οι πράξεις γίνονται με BigInt ώστε να μην υπάρχει καμία απώλεια ακρίβειας
 * κινητής υποδιαστολής: ένα λεπτό που χάνεται δεν επιστρέφει.
 */

const SCALE = 10_000n;

/** Βάρη (χιλιοστά, ώρες, ποσά) σε ακέραια κλιμακωμένα BigInt. */
function scaleWeights(weights: readonly number[]): bigint[] {
  return weights.map((w) => BigInt(Math.round(w * 10_000)));
}

/**
 * Στρογγυλοποίηση προς τα πάνω στο μισό: round(total × weight / totalWeight).
 * Χρησιμοποιείται για το κελί της συγκεντρωτικής — ίδια χιλιοστά δίνουν πάντα ίδιο ποσό.
 */
export function halfUpShare(total: number, weight: number, totalWeight: number): number {
  const d = BigInt(Math.round(totalWeight * 10_000));
  if (d === 0n) return 0;
  const n = BigInt(total) * BigInt(Math.round(weight * 10_000));
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const r = (2n * abs + d) / (2n * d);
  return Number(neg ? -r : r);
}

/**
 * Επιμερισμός ενός ακέραιου συνόλου σε μέρη, με τη μέθοδο του μεγαλύτερου
 * υπολοίπου: το άθροισμα των μερών ισούται **πάντα** με το σύνολο.
 *
 * Σε ισοβαθμία υπολοίπων προηγείται η μικρότερη θέση, ώστε το αποτέλεσμα να
 * είναι ντετερμινιστικό (ίδια είσοδος → ίδια έξοδος, πάντα).
 */
export function largestRemainder(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  if (total < 0) return largestRemainder(-total, weights).map((x) => -x);
  const w = scaleWeights(weights);
  const W = w.reduce((a, b) => a + b, 0n);
  if (W === 0n) return weights.map(() => 0);

  const T = BigInt(total);
  const base = w.map((x) => (T * x) / W);
  const remainder = w.map((x, i) => T * x - base[i]! * W);
  const out = base.map(Number);

  let left = Number(T - base.reduce((a, b) => a + b, 0n));
  if (left === 0) return out;
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = remainder[a]!;
      const rb = remainder[b]!;
      if (ra === rb) return a - b;
      return rb > ra ? 1 : -1;
    });

  for (let k = 0; k < left; k++) {
    const idx = order[k % order.length]!;
    out[idx] = out[idx]! + 1;
  }
  return out;
}

export { SCALE };
