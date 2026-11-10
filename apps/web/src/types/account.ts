/** Contratos del área de cuenta (PATCH /me, /me/addresses, /me/orders). */

export interface Address {
  id: string;
  label?: string;
  department: string;
  city: string;
  dane_code?: string;
  line1: string;
  line2?: string;
  notes?: string;
  is_default: boolean;
  created_at: string;
}
