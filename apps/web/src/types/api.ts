/** Contratos comunes de la API de Go (SSD §11). */

export type Role = "CUSTOMER" | "STAFF" | "ADMIN";

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Envelope<T> {
  data: T;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Cuerpo de error uniforme: { "error": { code, message, details } }. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  document_id?: string;
  role: Role;
  last_login_at?: string;
}

export interface AuthSession {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}
