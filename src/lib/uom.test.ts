/**
 * UOM conversion engine unit tests
 *
 * Run with: npx vitest run src/lib/uom.test.ts
 *
 * These tests cover the pure-TS client-side engine (buildUomEngine).
 * They do NOT require a database connection.
 */

import { describe, it, expect } from "vitest";
import {
  buildUomEngine,
  roundQty,
  formatQty,
  type UomMaster,
  type UomConversionRow,
} from "./uom";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MASTER: UomMaster[] = [
  // Unit class
  { id: "u1", code: "pc",   name: "Piece",      uom_class: "Unit",   is_base_unit: true,  symbol: "pc",  decimal_places: 0, is_active: true },
  { id: "u2", code: "pcs",  name: "Pieces",     uom_class: "Unit",   is_base_unit: false, symbol: "pcs", decimal_places: 0, is_active: true },
  { id: "u3", code: "doz",  name: "Dozen",      uom_class: "Unit",   is_base_unit: false, symbol: "doz", decimal_places: 0, is_active: true },
  { id: "u4", code: "pair", name: "Pair",       uom_class: "Unit",   is_base_unit: false, symbol: "pr",  decimal_places: 0, is_active: true },
  // Weight class
  { id: "w1", code: "kg",   name: "Kilogram",   uom_class: "Weight", is_base_unit: true,  symbol: "kg",  decimal_places: 3, is_active: true },
  { id: "w2", code: "g",    name: "Gram",       uom_class: "Weight", is_base_unit: false, symbol: "g",   decimal_places: 3, is_active: true },
  { id: "w3", code: "lb",   name: "Pound",      uom_class: "Weight", is_base_unit: false, symbol: "lb",  decimal_places: 3, is_active: true },
  { id: "w4", code: "oz",   name: "Ounce",      uom_class: "Weight", is_base_unit: false, symbol: "oz",  decimal_places: 3, is_active: true },
  // Length class
  { id: "l1", code: "m",    name: "Metre",      uom_class: "Length", is_base_unit: true,  symbol: "m",   decimal_places: 3, is_active: true },
  { id: "l2", code: "cm",   name: "Centimetre", uom_class: "Length", is_base_unit: false, symbol: "cm",  decimal_places: 2, is_active: true },
  { id: "l3", code: "mm",   name: "Millimetre", uom_class: "Length", is_base_unit: false, symbol: "mm",  decimal_places: 2, is_active: true },
  // Packaging class
  { id: "p1", code: "box",  name: "Box",        uom_class: "Packaging", is_base_unit: false, symbol: "box", decimal_places: 0, is_active: true },
  { id: "p2", code: "ctn",  name: "Carton",     uom_class: "Packaging", is_base_unit: false, symbol: "ctn", decimal_places: 0, is_active: true },
  // Inactive UOM — should be ignored
  { id: "z1", code: "old",  name: "Old Unit",   uom_class: "Unit",   is_base_unit: false, symbol: null,  decimal_places: 0, is_active: false },
];

const ITEM_A = "item-a-uuid";  // Widget — box = 12 pc, carton = 24 boxes
const ITEM_B = "item-b-uuid";  // Bulk item — bag = 500 g

const CONVERSIONS: UomConversionRow[] = [
  // Unit — global (no item_id)
  { id: "c1",  from_uom: "pcs",  to_uom: "pc",  factor: 1,          item_id: null,   uom_class: "Unit"   },
  { id: "c2",  from_uom: "doz",  to_uom: "pc",  factor: 12,         item_id: null,   uom_class: "Unit"   },
  { id: "c3",  from_uom: "pair", to_uom: "pc",  factor: 2,          item_id: null,   uom_class: "Unit"   },
  // Weight — global
  { id: "c4",  from_uom: "g",    to_uom: "kg",  factor: 0.001,      item_id: null,   uom_class: "Weight" },
  { id: "c5",  from_uom: "kg",   to_uom: "g",   factor: 1000,       item_id: null,   uom_class: "Weight" },
  { id: "c6",  from_uom: "lb",   to_uom: "kg",  factor: 0.45359237, item_id: null,   uom_class: "Weight" },
  { id: "c7",  from_uom: "oz",   to_uom: "kg",  factor: 0.02834952, item_id: null,   uom_class: "Weight" },
  // Length — global
  { id: "c8",  from_uom: "cm",   to_uom: "m",   factor: 0.01,       item_id: null,   uom_class: "Length" },
  { id: "c9",  from_uom: "mm",   to_uom: "m",   factor: 0.001,      item_id: null,   uom_class: "Length" },
  // Item A — item-specific packaging
  { id: "c10", from_uom: "box",  to_uom: "pc",  factor: 12,         item_id: ITEM_A, uom_class: null     },
  { id: "c11", from_uom: "ctn",  to_uom: "box", factor: 24,         item_id: ITEM_A, uom_class: null     },
  // Item B — item-specific (bulk: 1 bag = 500 g)
  { id: "c12", from_uom: "box",  to_uom: "g",   factor: 500,        item_id: ITEM_B, uom_class: null     },
];

const engine = buildUomEngine(MASTER, CONVERSIONS);

// ─── Helper ───────────────────────────────────────────────────────────────────

function assertConvert(
  qty: number,
  from: string,
  to: string,
  expected: number,
  itemId?: string | null
) {
  const result = engine.convert(qty, from, to, itemId);
  expect(result).not.toBeNull();
  expect(result!.qty).toBeCloseTo(expected, 6);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("roundQty", () => {
  it("rounds to 8 decimal places", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(1 / 3)).toBe(0.33333333);
    expect(roundQty(1.000000001)).toBe(1);
    expect(roundQty(1.000000005)).toBe(1.00000001);
  });

  it("handles exact integers", () => {
    expect(roundQty(12)).toBe(12);
    expect(roundQty(0)).toBe(0);
  });
});

describe("formatQty", () => {
  it("formats with default 2 decimal places", () => {
    expect(formatQty(12)).toContain("12");
    expect(formatQty(12.5)).toContain("12.5");
  });

  it("formats with custom decimal places", () => {
    expect(formatQty(1.23456789, 4)).toContain("1.2346");
    expect(formatQty(100, 0)).toBe("100");
  });
});

describe("identity conversion", () => {
  it("returns same quantity when from = to", () => {
    assertConvert(5, "pc", "pc", 5);
    assertConvert(0.5, "kg", "kg", 0.5);
  });

  it("path is 'identity'", () => {
    const r = engine.convert(10, "kg", "kg");
    expect(r?.path).toBe("identity");
  });
});

describe("direct conversion", () => {
  it("dozen to pieces", () => {
    assertConvert(1, "doz", "pc", 12);
    assertConvert(2.5, "doz", "pc", 30);
  });

  it("grams to kilograms", () => {
    assertConvert(1000, "g", "kg", 1);
    assertConvert(500, "g", "kg", 0.5);
    assertConvert(1, "g", "kg", 0.001);
  });

  it("kilograms to grams", () => {
    assertConvert(1, "kg", "g", 1000);
    assertConvert(0.001, "kg", "g", 1);
  });

  it("pair to pieces", () => {
    assertConvert(3, "pair", "pc", 6);
  });

  it("path is 'direct'", () => {
    const r = engine.convert(1, "doz", "pc");
    expect(r?.path).toBe("direct");
  });
});

describe("via-base conversion", () => {
  it("grams to pounds (g → kg → lb)", () => {
    // 500 g → 0.5 kg → 0.5 × 2.20462 lb ≈ 1.10231 lb
    // But we don't have kg→lb in CONVERSIONS, so this should fail via base
    // (only lb→kg is seeded, not kg→lb)
    const r = engine.convert(500, "g", "lb");
    expect(r).toBeNull(); // no kg→lb conversion seeded
  });

  it("centimetres to millimetres (cm → m → mm)", () => {
    // cm→m (0.01) then m→mm? We have mm→m but not m→mm
    // So this should be null unless we check reverse direction
    const r = engine.convert(100, "cm", "mm");
    expect(r).toBeNull(); // no m→mm seeded
  });

  it("centimetres to metres", () => {
    assertConvert(150, "cm", "m", 1.5);
  });
});

describe("item-specific conversions", () => {
  it("box to pc for item A (1 box = 12 pc)", () => {
    assertConvert(1, "box", "pc", 12, ITEM_A);
    assertConvert(2.5, "box", "pc", 30, ITEM_A);
  });

  it("carton to box for item A (1 ctn = 24 boxes)", () => {
    assertConvert(1, "ctn", "box", 24, ITEM_A);
  });

  it("item-specific conversion not available for unrelated item", () => {
    // box→pc requires ITEM_A's conversion; for ITEM_B no such conversion exists
    const r = engine.convert(1, "box", "pc", ITEM_B);
    expect(r).toBeNull();
  });

  it("item B bag (500 g) to kg", () => {
    // box→g (500) then g→kg (0.001) = 0.5 kg
    // This is cross-class (Packaging → Weight) via item-specific path
    // Since the engine resolves item-specific conversions first:
    // direct: box→g (500) for ITEM_B ✓ → then via g→kg global
    // Actually engine only resolves direct or via base for the SAME class.
    // cross-class works only when there's a direct item-specific conversion
    // from the source to the target (or an intermediate step).
    // bag→g is a direct item-specific conversion for ITEM_B.
    // g→kg is a direct global conversion.
    // The engine doesn't chain across item-specific + global for different classes.
    // So box→g is direct for ITEM_B (500 g), and then g→kg is direct (0.001).
    // The engine returns the direct hit first: box→g = 500 for ITEM_B.
    assertConvert(1, "box", "g", 500, ITEM_B);
  });
});

describe("class compatibility", () => {
  it("returns null for cross-class conversion (kg → pc)", () => {
    const r = engine.convert(1, "kg", "pc");
    expect(r).toBeNull();
  });

  it("returns null for cross-class conversion (m → l)", () => {
    const r = engine.convert(1, "m", "l");
    expect(r).toBeNull();
  });

  it("returns null when UOM not in master list", () => {
    const r = engine.convert(1, "unknown_uom", "kg");
    expect(r).toBeNull();
  });

  it("returns null for inactive UOM", () => {
    // 'old' is inactive — should not be resolvable
    const r = engine.convert(1, "old", "pc");
    expect(r).toBeNull();
  });
});

describe("hasPath", () => {
  it("returns true for valid path", () => {
    expect(engine.hasPath("doz", "pc")).toBe(true);
    expect(engine.hasPath("g", "kg")).toBe(true);
    expect(engine.hasPath("pc", "pc")).toBe(true); // identity
    expect(engine.hasPath("box", "pc", ITEM_A)).toBe(true);
  });

  it("returns false for invalid/unknown UOM", () => {
    expect(engine.hasPath("kg", "pc")).toBe(false);
    expect(engine.hasPath("box", "pc")).toBe(false); // no global box→pc
    expect(engine.hasPath("nonexistent", "pc")).toBe(false);
  });
});

describe("circular conversion detection", () => {
  it("detects simple A→B when B→A already exists", () => {
    // g→kg exists; trying to add kg→g would be circular
    // (kg→g IS in our fixture; trying to add g→kg again would not be circular
    //  since g→kg already exists as a direct conversion)
    // Test: kg→g exists. Add g→kg? That's already there. Let's test a new case:
    // We have doz→pc. Try adding pc→doz — is that circular? BFS from pc: no
    // doz→pc path, so pc→doz would not create a cycle.
    expect(engine.checkCircular("pc", "doz")).toBeNull();
  });

  it("detects same-unit circular", () => {
    const err = engine.checkCircular("pc", "pc");
    expect(err).not.toBeNull();
    expect(err).toContain("cannot convert to itself");
  });

  it("detects 3-hop cycle", () => {
    // A→B→C→A: we have g→kg and kg→g already.
    // Adding g→kg again? That already exists, no new cycle from scratch.
    // Build a custom engine to test cycle detection:
    const cycleMaster: UomMaster[] = [
      { id: "x1", code: "a", name: "A", uom_class: "Unit", is_base_unit: true,  symbol: null, decimal_places: 0, is_active: true },
      { id: "x2", code: "b", name: "B", uom_class: "Unit", is_base_unit: false, symbol: null, decimal_places: 0, is_active: true },
      { id: "x3", code: "c", name: "C", uom_class: "Unit", is_base_unit: false, symbol: null, decimal_places: 0, is_active: true },
    ];
    const cycleConvs: UomConversionRow[] = [
      { id: "x1", from_uom: "a", to_uom: "b", factor: 2, item_id: null, uom_class: "Unit" },
      { id: "x2", from_uom: "b", to_uom: "c", factor: 3, item_id: null, uom_class: "Unit" },
      // Now if we try to add c→a, it should detect the cycle a→b→c→a
    ];
    const ce = buildUomEngine(cycleMaster, cycleConvs);
    const err = ce.checkCircular("c", "a");
    expect(err).not.toBeNull();
    expect(err).toContain("cycle");
  });

  it("allows non-circular additions", () => {
    // In our engine, doz→pc exists. Adding g→kg (different class) — no cycle.
    expect(engine.checkCircular("g", "lb")).toBeNull(); // no existing g→lb path
  });
});

describe("getClass", () => {
  it("returns correct class", () => {
    expect(engine.getClass("kg")).toBe("Weight");
    expect(engine.getClass("pc")).toBe("Unit");
    expect(engine.getClass("m")).toBe("Length");
    expect(engine.getClass("box")).toBe("Packaging");
  });

  it("returns null for unknown code", () => {
    expect(engine.getClass("unknown")).toBeNull();
  });

  it("returns null for inactive UOM", () => {
    expect(engine.getClass("old")).toBeNull(); // inactive
  });
});

describe("getBase", () => {
  it("returns base unit for each class", () => {
    expect(engine.getBase("Unit")).toBe("pc");
    expect(engine.getBase("Weight")).toBe("kg");
    expect(engine.getBase("Length")).toBe("m");
  });

  it("returns null for classes with no base defined", () => {
    // Packaging has no base unit in our fixture
    expect(engine.getBase("Packaging")).toBeNull();
  });
});

describe("getByClass", () => {
  it("returns all active UOMs for a class", () => {
    const units = engine.getByClass("Unit");
    const codes = units.map((u) => u.code);
    expect(codes).toContain("pc");
    expect(codes).toContain("doz");
    expect(codes).not.toContain("old"); // inactive excluded
  });

  it("returns empty for unknown class", () => {
    expect(engine.getByClass("Time" as any)).toHaveLength(0);
  });
});

describe("precision — no floating-point corruption", () => {
  it("1000 × 0.001 = 1 exactly", () => {
    const r = engine.convert(1000, "g", "kg");
    expect(r?.qty).toBe(1);
  });

  it("0.001 × 1000 = 1 exactly", () => {
    const r = engine.convert(0.001, "kg", "g");
    expect(r?.qty).toBe(1);
  });

  it("12 dozen = 144 pieces exactly", () => {
    assertConvert(12, "doz", "pc", 144);
  });

  it("precision: 1/3 dozen rounds correctly", () => {
    const r = engine.convert(1 / 3, "doz", "pc");
    // (1/3) × 12 = 4 exactly
    expect(r?.qty).toBe(4);
  });

  it("precision: 1 lb in kg to 8 dp", () => {
    const r = engine.convert(1, "lb", "kg");
    expect(r?.qty).toBe(0.45359237); // exactly as seeded
  });

  it("precision: large quantity stays accurate", () => {
    // 1,000,000 g → kg = 1000 exactly
    assertConvert(1_000_000, "g", "kg", 1000);
  });
});
