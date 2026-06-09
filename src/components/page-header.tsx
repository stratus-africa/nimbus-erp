import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function NewButton({ onClick, label = "New" }: { onClick: () => void; label?: string }) {
  return (
    <Button onClick={onClick} className="gap-2">
      <Plus className="h-4 w-4" /> {label}
    </Button>
  );
}

export function useDialogState<T = unknown>() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const openFor = (d: T | null = null) => {
    setData(d);
    setOpen(true);
  };
  return { open, setOpen, data, openFor };
}
