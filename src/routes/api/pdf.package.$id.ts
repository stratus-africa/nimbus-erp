import { createFileRoute } from "@tanstack/react-router";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const Route = createFileRoute("/api/pdf/package/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = request.headers.get("authorization");
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
        );

        const { data, error } = await sb.rpc("get_package_pdf_data", { _id: params.id });
        if (error) return new Response(error.message, { status: 403 });
        if (!data) return new Response("Not found", { status: 404 });

        const pdf = await PDFDocument.create();
        const page = pdf.addPage([595, 842]); // A4
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        const { width, height } = page.getSize();
        const M = 40;
        let y = height - M;

        const p: any = (data as any).package;
        const t: any = (data as any).tenant;
        const so: any = (data as any).sales_order;
        const c: any = (data as any).customer;
        const items: any[] = (data as any).items ?? [];

        const text = (s: string, x: number, yy: number, size = 10, f = font, color = rgb(0.15, 0.15, 0.15)) =>
          page.drawText(s ?? "", { x, y: yy, size, font: f, color });

        // Title
        text("PACKAGE", width - M - 140, y, 22, bold, rgb(0.35, 0.35, 0.4));
        text(`# ${p?.package_number ?? ""}`, width - M - 140, y - 22, 11, font, rgb(0.4, 0.4, 0.4));

        // Tenant block
        text(t?.name ?? "", M, y, 14, bold);
        y -= 18;
        (t?.address ?? "").split("\n").slice(0, 4).forEach((ln: string) => {
          text(ln, M, y, 9, font, rgb(0.35, 0.35, 0.35));
          y -= 12;
        });
        if (t?.tax_number) { text(`PIN ${t.tax_number}`, M, y, 9, font, rgb(0.35, 0.35, 0.35)); y -= 12; }

        y -= 10;
        page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
        y -= 20;

        // Meta grid
        const meta = [
          ["Package #", p?.package_number ?? ""],
          ["Package Date", (p?.package_date ?? "").toString()],
          ["Sales Order #", so?.so_number ?? "—"],
          ["Order Date", (so?.so_date ?? "—").toString()],
          ["Status", (p?.status ?? "").toString().replace("_", " ").toUpperCase()],
        ];
        meta.forEach((pair, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = M + col * ((width - 2 * M) / 3);
          const yy = y - row * 34;
          text(pair[0], x, yy, 8, bold, rgb(0.5, 0.5, 0.5));
          text(pair[1], x, yy - 12, 10, font);
        });
        y -= 34 * Math.ceil(meta.length / 3) + 10;

        // Bill/Ship
        if (c) {
          text("BILL TO", M, y, 8, bold, rgb(0.5, 0.5, 0.5));
          text("SHIP TO", M + 280, y, 8, bold, rgb(0.5, 0.5, 0.5));
          y -= 14;
          const name = c?.company_name ?? c?.name ?? "";
          text(name, M, y, 10, bold, rgb(0.2, 0.4, 0.7));
          text(name, M + 280, y, 10, bold);
          y -= 14;
          const bill = (c?.billing_address ?? "").split("\n").slice(0, 3);
          const ship = (c?.shipping_address ?? c?.billing_address ?? "").split("\n").slice(0, 3);
          for (let i = 0; i < Math.max(bill.length, ship.length); i++) {
            if (bill[i]) text(bill[i], M, y, 9, font, rgb(0.35, 0.35, 0.35));
            if (ship[i]) text(ship[i], M + 280, y, 9, font, rgb(0.35, 0.35, 0.35));
            y -= 12;
          }
          y -= 8;
        }

        // Items header
        page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: rgb(0.15, 0.15, 0.2) });
        text("#", M + 6, y + 4, 9, bold, rgb(1, 1, 1));
        text("ITEM & DESCRIPTION", M + 30, y + 4, 9, bold, rgb(1, 1, 1));
        text("QTY", width - M - 60, y + 4, 9, bold, rgb(1, 1, 1));
        y -= 22;

        items.forEach((it, i) => {
          if (y < 60) { const np = pdf.addPage([595, 842]); y = np.getSize().height - M; }
          text(String(i + 1), M + 6, y, 9);
          text(it.name ?? "", M + 30, y, 10);
          if (it.description && it.description !== it.name) {
            y -= 12;
            text(it.description, M + 30, y, 8, font, rgb(0.4, 0.4, 0.4));
          }
          text(`${Number(it.quantity ?? 0).toFixed(2)} ${it.unit ?? ""}`, width - M - 70, y, 9);
          y -= 18;
          page.drawLine({ start: { x: M, y: y + 4 }, end: { x: width - M, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });
        });

        y -= 20;
        const total = items.reduce((s, it) => s + Number(it.quantity ?? 0), 0);
        text(`Total Quantity: ${total.toFixed(2)}`, width - M - 180, y, 11, bold);

        if (p?.notes) {
          y -= 30;
          text("NOTES", M, y, 8, bold, rgb(0.5, 0.5, 0.5));
          y -= 14;
          String(p.notes).split("\n").slice(0, 6).forEach((ln: string) => {
            text(ln, M, y, 9, font, rgb(0.35, 0.35, 0.35));
            y -= 12;
          });
        }

        const bytes = await pdf.save();
        // Convert Uint8Array to plain ArrayBuffer for Response body typing.
        const body = new Uint8Array(bytes);
        return new Response(body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${p?.package_number ?? "package"}.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
