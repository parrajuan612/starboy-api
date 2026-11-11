import { http } from "@/lib/api-client";
import { getPage } from "@/lib/paged";
import type { CreateImportInput, Estimate, EstimateItemInput, ImportRate, ImportRequest, Payment } from "@/types";

export const getImportRates = () => http.get<ImportRate[]>("/imports/rates");

/** Calculadora pública: un ESTIMADO. El valor final lo fija el equipo en la cotización. */
export const estimateImport = (items: EstimateItemInput[]) => http.post<Estimate>("/imports/quote", { items });

export const createImport = (input: CreateImportInput) => http.post<ImportRequest>("/imports", input);

export const listMyImports = (page: number, signal?: AbortSignal) => getPage<ImportRequest>("/imports/my-requests", { page, limit: 10 }, signal);

export const getMyImport = (id: string) => http.get<ImportRequest>(`/imports/${encodeURIComponent(id)}`);

export const acceptQuote = (id: string, quoteId: string) =>
  http.post<ImportRequest>(`/imports/${encodeURIComponent(id)}/quotes/${encodeURIComponent(quoteId)}/accept`);

/** Abre (o recupera) el cobro del anticipo. El monto sale de la cotización aceptada, en el servidor. */
export const createImportPayment = (importId: string) => http.post<Payment>("/payments/checkout", { import_request_id: importId, provider: "SANDBOX" });

export const importPath = (id: string, qs = "") => `/cuenta/encargos/${id}${qs}`;
