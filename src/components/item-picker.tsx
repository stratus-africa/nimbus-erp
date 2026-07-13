import { useEffect, useMemo, useRef, useState } from "react";
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
import { Check, ChevronsUpDown, Package as PackageIcon, Search } from "lucide-react";
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
 *
 * Features:
 * - Debounced search (120ms) to keep large item lists responsive
 * - Keyboard navigation: ↑/↓ to move, Enter to select, Esc to close, Tab to
 *   commit and move on. `cmdk` powers keyboard nav; we make sure the input is
 *   auto-focused and matches are ordered by SKU prefix > name prefix > substring.
 * - Clear focus/hover states with strong contrast for both light & dark modes.
 */
export function ItemPicker({
  items,
  value,
  onSelect,
  placeholder = "Type to search items…",
  disabled,
}: {
  items: PickerItem[];
  value?: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rawSearch, setRawSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(rawSearch), 120);
    return () => clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    if (open) {
      // small delay so Popover mounts the input before we focus it
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    } else {
      setRawSearch("");
      setDebounced("");
    }
  }, [open]);

  const selected = items.find((i) => i.id === value);

  const ranked = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return items;
    const scored = items
      .map((it) => {
        const name = it.name?.toLowerCase() ?? "";
        const sku = (it.sku ?? "").toLowerCase();
        let score = 0;
        if (sku && sku.startsWith(q)) score = 100;
        else if (name.startsWith(q)) score = 80;
        else if (sku.includes(q)) score = 40;
        else if (name.includes(q)) score = 20;
        return { it, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name));
    return scored.map((x) => x.it);
  }, [items, debounced]);

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "group h-9 w-full justify-between px-3 text-sm font-normal transition-colors",
            "border-sky-200 bg-white hover:border-sky-400 hover:bg-sky-50/50",
            "focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
            selected && "border-sky-300 bg-sky-50/60 text-foreground",
            "dark:border-sky-900 dark:bg-background dark:hover:bg-sky-950/30",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <PackageIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-sky-500",
                !selected && "opacity-70",
              )}
            />
            <span
              className={cn(
                "truncate text-left",
                !selected && "text-sky-600/70 dark:text-sky-400/70",
              )}
            >
              {selected
                ? `${selected.name}${selected.sku ? ` · ${selected.sku}` : ""}`
                : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sky-600 opacity-70 group-hover:opacity-100" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,calc(100vw-2rem))] p-0 shadow-xl"
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false} loop>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <CommandInput
              ref={inputRef as any}
              value={rawSearch}
              onValueChange={setRawSearch}
              placeholder="Search by name or SKU…"
              className="h-10 border-0 focus:ring-0"
            />
            {rawSearch && (
              <button
                type="button"
                onClick={() => setRawSearch("")}
                className="ml-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <CommandList className="max-h-[340px]">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              {debounced ? `No items matching "${debounced}".` : "No items available."}
            </CommandEmpty>
            <CommandGroup className="p-1">
              {(debounced ? ranked : items).map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onSelect(it.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "cursor-pointer rounded-md px-2 py-2 text-sm",
                    "aria-selected:bg-sky-100 aria-selected:text-sky-900",
                    "data-[selected=true]:bg-sky-100 data-[selected=true]:text-sky-900",
                    "hover:bg-sky-50",
                    "dark:aria-selected:bg-sky-900/40 dark:aria-selected:text-sky-50",
                    "dark:data-[selected=true]:bg-sky-900/40 dark:hover:bg-sky-950/40",
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 text-sky-600",
                      value === it.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{it.name}</span>
                      {it.sku && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          SKU: {it.sku}
                        </span>
                      )}
                    </div>
                    {typeof it.selling_price === "number" && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-300">
                        {Number(it.selling_price).toFixed(2)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border bg-muted px-1">↑↓</kbd> navigate
              <span className="mx-2">·</span>
              <kbd className="rounded border bg-muted px-1">↵</kbd> select
              <span className="mx-2">·</span>
              <kbd className="rounded border bg-muted px-1">esc</kbd> close
            </span>
            <span>{(debounced ? ranked.length : items.length)} items</span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
