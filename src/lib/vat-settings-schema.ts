import { z } from "zod";

export const vatSettingsSchema = z.object({
  vatNumberLabel: z.string().min(1).max(40).default("PIN"),
  vatRegistrationNumber: z.string().max(40).default(""),
  isVatRegistered: z.boolean().default(false),
  enableInternationalTrade: z.boolean().default(false),
  vatRegisteredOn: z.string().nullable().default(null),
  firstReturnFrom: z.string().nullable().default(null),
  reportingPeriod: z.enum(["monthly", "quarterly", "yearly", "custom"]).default("monthly"),
  withholdingVatEnabled: z.boolean().default(false),
  withholdingVatAppliesTo: z.enum(["customers", "vendors", "both"]).default("both"),
}).superRefine((val, ctx) => {
  if (val.isVatRegistered && !val.vatRegistrationNumber.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vatRegistrationNumber"], message: "VAT registration number is required when registered for VAT" });
  }
  if (val.isVatRegistered && !val.vatRegisteredOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vatRegisteredOn"], message: "VAT registered date is required" });
  }
  if (val.isVatRegistered && !val.firstReturnFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["firstReturnFrom"], message: "First return date is required" });
  }
});

export type VATSettings = z.infer<typeof vatSettingsSchema>;
export const VAT_SETTINGS_DEFAULTS: VATSettings = vatSettingsSchema.parse({});
