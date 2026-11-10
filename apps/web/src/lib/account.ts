import { http } from "@/lib/api-client";
import { getPage } from "@/lib/paged";
import type { Address, Order, User } from "@/types";

export interface ProfileInput {
  full_name: string;
  phone: string;
  document_id: string;
}

export const updateProfile = (input: ProfileInput) => http.patch<User>("/me", input);

export const listAddresses = () => http.get<Address[]>("/me/addresses");

export type AddressInput = Pick<Address, "department" | "city" | "line1"> & {
  label?: string;
  line2?: string;
  notes?: string;
  is_default?: boolean;
};

export const createAddress = (input: AddressInput) => http.post<Address>("/me/addresses", input);
export const updateAddress = (id: string, input: Partial<AddressInput>) => http.patch<Address>(`/me/addresses/${id}`, input);
export const deleteAddress = (id: string) => http.delete<void>(`/me/addresses/${id}`);

export const listMyOrders = (page: number, signal?: AbortSignal) => getPage<Order>("/me/orders", { page, limit: 10 }, signal);
