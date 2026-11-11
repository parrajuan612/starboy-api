import { api, http } from "@/lib/api-client";
import type {
  AdminBrand, AdminCategory, AdminProduct, AdminRate, BusinessSetting, ProductInput, ProductStatus, RateInput, UploadedFile, VariantInput,
} from "@/types";

// ── Marcas y categorías
export const listBrands = () => http.get<AdminBrand[]>("/admin/brands");
export const createBrand = (input: { name: string; logo_url?: string; is_active?: boolean }) => http.post<AdminBrand>("/admin/brands", input);
export const updateBrand = (id: string, input: Partial<{ name: string; logo_url: string; is_active: boolean }>) => http.patch<AdminBrand>(`/admin/brands/${id}`, input);
export const deleteBrand = (id: string) => http.delete<void>(`/admin/brands/${id}`);

export const listCategories = () => http.get<AdminCategory[]>("/admin/categories");
export const createCategory = (input: { name: string; parent_id?: string; sort_order?: number; is_active?: boolean }) => http.post<AdminCategory>("/admin/categories", input);
export const updateCategory = (id: string, input: Partial<{ name: string; parent_id: string; make_root: boolean; sort_order: number; is_active: boolean }>) =>
  http.patch<AdminCategory>(`/admin/categories/${id}`, input);
export const deleteCategory = (id: string) => http.delete<void>(`/admin/categories/${id}`);

// ── Productos
export const getAdminProduct = (id: string) => http.get<AdminProduct>(`/admin/products/${id}`);
export const createProduct = (input: ProductInput) => http.post<AdminProduct>("/admin/products", input);
export const updateProduct = (id: string, input: Partial<ProductInput> & { status?: ProductStatus }) => http.patch<AdminProduct>(`/admin/products/${id}`, input);
export const deleteProduct = (id: string) => http.delete<void>(`/admin/products/${id}`);

// ── Variantes (tallas y stock)
export const createVariant = (productId: string, input: VariantInput) => http.post<AdminProduct>(`/admin/products/${productId}/variants`, input);
export const updateVariant = (productId: string, variantId: string, input: Partial<VariantInput>) =>
  http.patch<AdminProduct>(`/admin/products/${productId}/variants/${variantId}`, input);
export const deleteVariant = (productId: string, variantId: string) => http.delete<AdminProduct>(`/admin/products/${productId}/variants/${variantId}`);

// ── Fotos
/** Sube un archivo (JPG, PNG o WebP, hasta 5 MB). Devuelve la URL y el id para registrarla en el producto. */
export async function uploadImage(file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append("file", file);
  return (await api.post<{ data: UploadedFile }>("/admin/uploads", body, { timeout: 60_000 })).data.data;
}
export const addImage = (productId: string, input: { public_id: string; url: string; alt?: string }) =>
  http.post<AdminProduct>(`/admin/products/${productId}/images`, input);
export const deleteImage = (productId: string, imageId: string) => http.delete<AdminProduct>(`/admin/products/${productId}/images/${imageId}`);
export const reorderImages = (productId: string, imageIds: string[]) => http.patch<AdminProduct>(`/admin/products/${productId}/images/order`, { image_ids: imageIds });

// ── Parámetros de negocio y tarifas de encargos
export const getSettings = () => http.get<BusinessSetting[]>("/admin/settings");
export const saveSettings = (values: Record<string, number>) => http.put<BusinessSetting[]>("/admin/settings", { values });

export const listRates = () => http.get<AdminRate[]>("/admin/import-rates");
export const createRate = (input: RateInput) => http.post<AdminRate>("/admin/import-rates", input);
export const updateRate = (id: string, input: Partial<RateInput>) => http.patch<AdminRate>(`/admin/import-rates/${id}`, input);
