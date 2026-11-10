import type { ImportStatus } from "@/types";

export const IMPORT_LABEL: Record<ImportStatus, string> = {
  REQUESTED: "Solicitada",
  QUOTED: "Cotizada",
  ACCEPTED: "Aceptada",
  PAID: "Anticipo pagado",
  PURCHASED: "Comprada en USA",
  IN_US_WAREHOUSE: "En bodega USA",
  IN_TRANSIT: "En tránsito",
  IN_CUSTOMS: "En aduana",
  IN_CO_WAREHOUSE: "En bodega Colombia",
  BALANCE_DUE: "Saldo pendiente",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
};

export const IMPORT_STATUSES = Object.keys(IMPORT_LABEL) as ImportStatus[];

/** Columnas del tablero: agrupan los 15 estados por etapa del encargo. */
export const IMPORT_COLUMNS: { id: string; title: string; statuses: ImportStatus[] }[] = [
  { id: "new", title: "Por cotizar", statuses: ["REQUESTED"] },
  { id: "quoted", title: "Cotizadas", statuses: ["QUOTED", "EXPIRED"] },
  { id: "paid", title: "Aceptadas y pagadas", statuses: ["ACCEPTED", "PAID"] },
  { id: "us", title: "Compra y bodega USA", statuses: ["PURCHASED", "IN_US_WAREHOUSE"] },
  { id: "transit", title: "En camino", statuses: ["IN_TRANSIT", "IN_CUSTOMS"] },
  { id: "co", title: "En Colombia", statuses: ["IN_CO_WAREHOUSE", "BALANCE_DUE", "OUT_FOR_DELIVERY"] },
  { id: "closed", title: "Cerradas", statuses: ["DELIVERED", "REJECTED", "CANCELLED"] },
];

export const importBadge = (s: ImportStatus): string =>
  s === "DELIVERED" ? "sb-badge--success" : s === "REJECTED" || s === "CANCELLED" || s === "EXPIRED" ? "sb-badge--danger" : s === "REQUESTED" ? "sb-badge--neutral" : "sb-badge--brand-outline";
