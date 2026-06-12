import { z } from "zod";

export const VALUATION_METHODS = [
  "none",
  "FIFO (First In, First Out)",
  "LIFO (Last In, First Out)",
  "Weighted Average",
] as const;

export const itemsSettingsSchema = z
  .object({
    decimals: z.enum(["0", "2", "3", "4"]).default("2"),
    dimensionUnit: z.enum(["cm", "in", "m", "ft"]).default("cm"),
    weightUnit: z.enum(["kg", "g", "lb", "oz"]).default("kg"),
    barcodeField: z.enum(["SKU", "Barcode", "Item Name"]).default("SKU"),

    valuationMethod: z.enum(VALUATION_METHODS).default("FIFO (First In, First Out)"),

    allowDuplicateNames: z.boolean().default(false),
    enhancedSearch: z.boolean().default(false),
    hsCodes: z.boolean().default(true),

    priceLists: z.boolean().default(true),
    priceListLineLevel: z.boolean().default(false),

    compositeItems: z.boolean().default(true),

    inventoryTracking: z.boolean().default(true),
    inventoryStartDate: z.string().default("2022-06-30"),

    serialTracking: z.boolean().default(false),
    batchTracking: z.boolean().default(true),
    allowDupBatch: z.boolean().default(true),
    returnsSoldBatch: z.boolean().default(false),
    batchSellingPrice: z.boolean().default(false),

    preventNegativeStock: z.boolean().default(true),
    stockLevel: z.enum(["branch", "warehouse"]).default("branch"),
    outOfStockWarn: z.boolean().default(true),
    reorderNotify: z.boolean().default(false),
    notifyEmail: z.string().email().or(z.literal("")).default(""),
    trackLandedCost: z.boolean().default(true),
    replenishments: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Cross-field rules
    if (!v.inventoryTracking && v.valuationMethod !== "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valuationMethod"],
        message: "Valuation method must be N/A when inventory tracking is disabled.",
      });
    }
    if (v.inventoryTracking && v.valuationMethod === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valuationMethod"],
        message: "Select a valuation method when inventory tracking is enabled.",
      });
    }
    if (v.reorderNotify && !v.notifyEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notifyEmail"],
        message: "Notify email is required when reorder notifications are enabled.",
      });
    }
    if (!v.batchTracking && (v.allowDupBatch || v.returnsSoldBatch || v.batchSellingPrice)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["batchTracking"],
        message: "Batch sub-options require batch tracking to be enabled.",
      });
    }
  });

export type ItemsSettings = z.infer<typeof itemsSettingsSchema>;

export const ITEMS_SETTINGS_DEFAULTS: ItemsSettings = itemsSettingsSchema.parse({});
