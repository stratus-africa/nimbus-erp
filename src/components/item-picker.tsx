import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerItem = {
  id: string;
  name: string;
  sku?: string | null;
  selling_price?: number | null;
  cost_price?: number | null;
  item_type?: string | null;
};

/**
 * Searchable item combobox for transaction line rows.
 * Filters by name and SKU as the user types.
 */
export function ItemPicker({
  items,
  value,
  onSelect,
  placeholder = "Type to search items…",
}: {
  items: PickerItem[];
  value?: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-2 text-xs font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command
          filter={(v, search) => {
            const it = items.find((i) => i.id === v);
            if (!it) return 0;
            const hay = `${it.name} ${it.sku ?? ""}`.toLowerCase();
            return hay.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by name or SKU…" />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onSelect(it.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === it.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="truncate">{it.name}</span>
                      {it.sku && (
                        <span className="text-[10px] text-muted-foreground">
                          {it.sku}
                        </span>
                      )}
                    </div>
                    {typeof it.selling_price === "number" && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {Number(it.selling_price).toFixed(2)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
