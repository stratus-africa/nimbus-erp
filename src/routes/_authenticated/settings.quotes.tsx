import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Info, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/quotes")({
  head: () => ({ meta: [{ title: "Quotes Settings — Nimbus ERP" }] }),
  component: QuotesSettingsPage,
});

const TABS = [
  "General",
  "Approvals",
  "Field Customization",
  "Validation Rules",
  "Record Locking",
  "Custom Buttons",
  "Related Lists",
] as const;
type Tab = (typeof TABS)[number];

function QuotesSettingsPage() {
  const [tab, setTab] = useState<Tab>("General");
  const [allowEditAccepted, setAllowEditAccepted] = useState(true);
  const [allowExternalAccept, setAllowExternalAccept] = useState(false);
  const [conversion, setConversion] = useState("none");
  const [hideZero, setHideZero] = useState(false);
  const [retainNotes, setRetainNotes] = useState(true);
  const [retainTerms, setRetainTerms] = useState(false);
  const [retainAddress, setRetainAddress] = useState(true);
  const [terms, setTerms] = useState(
    `1. License Fees: License fees must be paid in full either upfront or upon the expiration of the trial period, whichever occurs first.\n2. Consultancy Fees: A down payment of 30% of the consultancy fees is required before the commencement of the project.\n3. SLAs are Optional and charged at KES. 8,000 per Month and Optional or at KES. 800 per Hour`,
  );
  const [notes, setNotes] = useState(
    `Quoted Rates are VAT Exclusive Unless Stated\nLooking forward for your business.`,
  );

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="border-b bg-card px-6 py-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
          <Link to="/settings"><ChevronLeft className="h-4 w-4" /> Back</Link>
        </Button>
        <h1 className="text-xl font-semibold">Quotes</h1>
      </div>

      <div className="px-6 pt-4">
        <div className="flex gap-6 border-b">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "py-2 text-sm transition-colors -mb-px border-b-2",
                tab === t
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-4xl">
        {tab === "General" && (
          <div className="space-y-6">
            <div className="flex items-start gap-2">
              <Checkbox id="edit-accepted" checked={allowEditAccepted} onCheckedChange={(v) => setAllowEditAccepted(!!v)} className="mt-0.5" />
              <Label htmlFor="edit-accepted" className="font-normal cursor-pointer">Allow editing of accepted quotes</Label>
            </div>

            <div className="border-t pt-5 space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox id="ext-accept" checked={allowExternalAccept} onCheckedChange={(v) => setAllowExternalAccept(!!v)} className="mt-0.5" />
                <Label htmlFor="ext-accept" className="font-normal cursor-pointer">
                  Allow customers to accept or decline the quotes via platforms like Whatsapp, and <span className="text-primary underline">public link</span>
                </Label>
              </div>
              <div className="ml-6 flex gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span className="text-foreground/80">
                  To let customers approve or reject quotes via WhatsApp, enable this option and add Quick Reply buttons in the Call-to-Action Buttons section in the respective Quote template.
                </span>
              </div>
            </div>

            <div className="border-t pt-5 space-y-3">
              <h3 className="font-semibold">Automate accepted quotes to invoices conversion</h3>
              <RadioGroup value={conversion} onValueChange={setConversion} className="space-y-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="none" id="c-none" />
                  <Label htmlFor="c-none" className="font-normal cursor-pointer">Don't convert accepted quotes automatically</Label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <RadioGroupItem value="draft" id="c-draft" />
                  <Label htmlFor="c-draft" className="font-normal cursor-pointer">Convert accepted quotes to draft invoices</Label>
                  <span className="text-xs text-muted-foreground">(Invoice will be saved as a draft.)</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <RadioGroupItem value="send" id="c-send" />
                  <Label htmlFor="c-send" className="font-normal cursor-pointer">Convert accepted quotes to invoices and email it to the customer</Label>
                  <span className="text-xs text-muted-foreground">(Invoice will be sent to your customer.)</span>
                </div>
              </RadioGroup>
            </div>

            <div className="border-t pt-5 space-y-2">
              <h3 className="font-semibold">Zero-Value Line Items</h3>
              <div className="flex items-start gap-2">
                <Checkbox id="hide-zero" checked={hideZero} onCheckedChange={(v) => setHideZero(!!v)} className="mt-0.5" />
                <div>
                  <Label htmlFor="hide-zero" className="font-normal cursor-pointer">Hide zero-value line items</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Choose whether you want to hide zero-value line items in a quote's PDF and the Customer Portal. They will still be visible while editing a quote. This setting will not apply to quotes whose total is zero.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-5 space-y-3">
              <h3 className="font-semibold">Select the fields in a quote that you'd like to retain when you convert it into a sales order or invoice.</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox id="r-notes" checked={retainNotes} onCheckedChange={(v) => setRetainNotes(!!v)} />
                  <Label htmlFor="r-notes" className="font-normal cursor-pointer">Customer Notes</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="r-terms" checked={retainTerms} onCheckedChange={(v) => setRetainTerms(!!v)} />
                  <Label htmlFor="r-terms" className="font-normal cursor-pointer">Terms & Conditions</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="r-addr" checked={retainAddress} onCheckedChange={(v) => setRetainAddress(!!v)} />
                  <Label htmlFor="r-addr" className="font-normal cursor-pointer">Address</Label>
                </div>
              </div>
            </div>

            <div className="border-t pt-5 space-y-2">
              <Label htmlFor="terms" className="font-semibold">Terms & Conditions</Label>
              <Textarea id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={6} />
            </div>

            <div className="border-t pt-5 space-y-2">
              <Label htmlFor="notes" className="font-semibold">Customer Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>

            <div className="border-t pt-5">
              <Button onClick={() => toast.success("Quote settings saved")} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
            </div>
          </div>
        )}

        {tab !== "General" && (
          <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
            {tab} settings coming soon.
          </div>
        )}
      </div>
    </div>
  );
}
