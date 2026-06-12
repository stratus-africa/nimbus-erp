// Composite item helpers — pure functions used by UI.

export type ComponentLine = {
  component_item_id: string;
  quantity: number;
  unit_cost: number;
};

export function calculateCompositeCost(components: ComponentLine[]): number {
  return components.reduce(
    (sum, c) => sum + Number(c.quantity || 0) * Number(c.unit_cost || 0),
    0,
  );
}

export function calculateCompositeAvailability(
  components: { quantity: number; stock_on_hand: number }[],
): number {
  if (!components.length) return 0;
  return Math.floor(
    Math.min(
      ...components.map((c) =>
        c.quantity > 0 ? Number(c.stock_on_hand ?? 0) / Number(c.quantity) : Infinity,
      ),
    ),
  );
}

// Given a composite parent quantity sold, return the explosion of component
// movements: [{ component_item_id, quantity }, ...]
export function explodeCompositeInventory(
  components: ComponentLine[],
  parentQty: number,
): { component_item_id: string; quantity: number }[] {
  return components.map((c) => ({
    component_item_id: c.component_item_id,
    quantity: Number(c.quantity) * Number(parentQty),
  }));
}
