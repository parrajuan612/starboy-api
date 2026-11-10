import { http } from "@/lib/api-client";
import type { AdminOrder, ImportRequest, ImportStatus, UpdateOrderStatusResult } from "@/types";

export const getAdminOrder = (id: string) => http.get<AdminOrder>(`/admin/orders/${id}`);

export interface OrderStatusInput {
  status: "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  note?: string;
  carrier?: string;
  tracking_number?: string;
}
export const updateOrderStatus = (id: string, input: OrderStatusInput) =>
  http.patch<UpdateOrderStatusResult>(`/admin/orders/${id}/status`, input);

export const getAdminImport = (id: string) => http.get<ImportRequest>(`/admin/imports/${id}`);

export interface ImportStatusInput {
  status: ImportStatus;
  note?: string;
  notify_customer?: boolean;
  carrier_usa?: string;
  tracking_usa?: string;
  tracking_co?: string;
}
export const changeImportStatus = (id: string, input: ImportStatusInput) =>
  http.patch<ImportRequest>(`/admin/imports/${id}/status`, input);

export interface QuoteInput {
  deposit_percent?: number;
  logistics_cop_override?: number;
  balance_cod_allowed: boolean;
  notes_customer?: string;
}
export const createImportQuote = (id: string, input: QuoteInput) => http.post<unknown>(`/admin/imports/${id}/quotes`, input);
