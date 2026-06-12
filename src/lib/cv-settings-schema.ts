import { z } from "zod";

export const cvSettingsSchema = z.object({
  enableCustomerNumbers: z.boolean().default(false),
  enableVendorNumbers: z.boolean().default(false),
  customerNumberPrefix: z.string().max(10).default("CUST-"),
  customerNumberNext: z.coerce.number().int().min(1).default(1),
  vendorNumberPrefix: z.string().max(10).default("VEND-"),
  vendorNumberNext: z.coerce.number().int().min(1).default(1),

  defaultCustomerType: z.enum(["business", "individual"]).default("business"),

  customerCreditLimitEnabled: z.boolean().default(true),
  creditLimitExceededAction: z.enum(["restrict", "warn"]).default("warn"),
  includeSalesOrdersInCreditLimit: z.boolean().default(true),

  multiCurrencyPerContact: z.boolean().default(false),
});

export type CVSettings = z.infer<typeof cvSettingsSchema>;
export const CV_SETTINGS_DEFAULTS: CVSettings = cvSettingsSchema.parse({});
