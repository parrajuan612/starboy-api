"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmButton } from "@/components/admin/catalog/ConfirmButton";
import { ImagesEditor, MIN_IMAGES } from "@/components/admin/catalog/ImagesEditor";
import { ProductForm } from "@/components/admin/catalog/ProductForm";
import { VariantsEditor } from "@/components/admin/catalog/VariantsEditor";
import { Alert, Button } from "@/components/ui";
import { ApiError, isApiError } from "@/lib/api-client";
import { createProduct, deleteProduct, getAdminProduct, listBrands, listCategories, updateProduct } from "@/lib/catalog-admin";
import { PRODUCT_STATUS_LABEL, productBadge } from "@/lib/product-status";
import type { AdminBrand, AdminCategory, AdminProduct, ProductInput, ProductStatus } from "@/types";

/** Marcas y categorías para los selectores del formulario. */
function useRefs() {
  const [refs, setRefs] = useState<{ brands: AdminBrand[]; categories: AdminCategory[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([listBrands(), listCategories()])
      .then(([brands, categories]) => alive && setRefs({ brands, categories }))
      .catch((e) => alive && setError(isApiError(e) ? e.message : "No pudimos cargar marcas y categorías."));
    return () => {
      alive = false;
    };
  }, []);
  return { refs, error };
}

const Loading = ({ what }: { what: string }) => (
  <p role="status" className="body text-ink-muted flex items-center gap-2">
    <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> Cargando {what}…
  </p>
);

/** Crear un producto: nace como borrador; las tallas y las fotos se agregan en la pantalla siguiente. */
export function NewProduct() {
  const router = useRouter();
  const { refs, error } = useRefs();

  async function create(input: ProductInput) {
    const p = await createProduct(input);
    router.push(`/admin/productos/${p.id}?nuevo=1`);
  }

  return (
    <div className="max-w-3xl">
      <Link href="/admin/productos" className="body-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline">
        ← Productos
      </Link>
      <h1 className="display-md mt-2">Nuevo producto</h1>
      <p className="body text-ink-muted mt-2">Empieza por los datos básicos. Se guarda como borrador: no se ve en la tienda hasta que lo publiques.</p>
      <div className="mt-8">
        {error && <Alert>{error}</Alert>}
        {!refs && !error && <Loading what="el formulario" />}
        {refs && <ProductForm brands={refs.brands} categories={refs.categories} onSubmit={create} submitLabel="Crear producto" />}
      </div>
    </div>
  );
}

/** Edición completa de un producto: publicación, datos, tallas y stock, y fotos. */
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refs, error: refsError } = useRefs();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [statusBusy, setStatusBusy] = useState<ProductStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAdminProduct(id)
      .then((p) => alive && setProduct(p))
      .catch((e) => alive && setError(e instanceof ApiError ? e : new ApiError(0, "UNKNOWN", "No pudimos cargar el producto.")));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="max-w-xl space-y-4">
        <Alert>{error.status === 404 ? "No encontramos ese producto." : error.message}</Alert>
        <Link href="/admin/productos" className="sb-btn sb-btn--secondary">
          Volver a productos
        </Link>
      </div>
    );
  }
  if (!product) return <Loading what="el producto" />;

  async function setStatus(status: ProductStatus) {
    setStatusBusy(status);
    setStatusError(null);
    try {
      setProduct(await updateProduct(id, { status }));
    } catch (e) {
      setStatusError(isApiError(e) ? e.message : "No pudimos cambiar el estado.");
    }
    setStatusBusy(null);
  }

  async function save(input: ProductInput) {
    setProduct(await updateProduct(id, input));
  }

  async function remove() {
    try {
      await deleteProduct(id);
      router.replace("/admin/productos");
    } catch (e) {
      setStatusError(isApiError(e) ? e.message : "No pudimos eliminar el producto.");
    }
  }

  const hasStock = (product.variants ?? []).some((v) => v.available > 0);
  const checks = [
    { ok: product.image_count >= MIN_IMAGES, text: `Mínimo ${MIN_IMAGES} fotos (${product.image_count} de ${MIN_IMAGES})` },
    { ok: product.variant_count > 0, text: "Al menos una talla" },
    { ok: hasStock, text: "Stock disponible en alguna talla (opcional, pero sin stock no se puede comprar)" },
  ];

  return (
    <div className="max-w-4xl space-y-12">
      <div>
        <Link href="/admin/productos" className="body-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline">
          ← Productos
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-md">{product.name}</h1>
          <span className={`sb-badge ${productBadge(product.status)}`}>{PRODUCT_STATUS_LABEL[product.status]}</span>
        </div>
        {product.status === "ACTIVE" && (
          <Link href={`/producto/${product.slug}`} className="body-sm text-accent mt-1 inline-block underline underline-offset-4">
            Ver en la tienda
          </Link>
        )}
      </div>

      {params.get("nuevo") === "1" && (
        <p role="status" className="text-success body flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          Producto creado como borrador. Ahora agrega las tallas y las fotos para poder publicarlo.
        </p>
      )}

      <section aria-labelledby="pub-title" className="bg-surface-raised border-line space-y-4 border p-5">
        <h2 id="pub-title" className="display-sm">
          Publicación
        </h2>
        <ul aria-label="Requisitos para publicar" className="space-y-1">
          {checks.map((c) => (
            <li key={c.text} className={`body-sm flex items-start gap-2 ${c.ok ? "text-ink" : "text-ink-muted"}`}>
              {c.ok ? <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
              <span>
                {c.text}
                <span className="sr-only">{c.ok ? " (cumplido)" : " (pendiente)"}</span>
              </span>
            </li>
          ))}
        </ul>
        {statusError && <Alert>{statusError}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          {product.status !== "ACTIVE" && (
            <Button onClick={() => setStatus("ACTIVE")} loading={statusBusy === "ACTIVE"} disabled={product.image_count < MIN_IMAGES || statusBusy !== null}>
              Publicar en la tienda
            </Button>
          )}
          {product.status === "ACTIVE" && (
            <Button variant="secondary" onClick={() => setStatus("DRAFT")} loading={statusBusy === "DRAFT"} disabled={statusBusy !== null}>
              Pasar a borrador
            </Button>
          )}
          {product.status !== "ARCHIVED" && (
            <Button variant="secondary" onClick={() => setStatus("ARCHIVED")} loading={statusBusy === "ARCHIVED"} disabled={statusBusy !== null}>
              Archivar
            </Button>
          )}
        </div>
        {product.image_count < MIN_IMAGES && product.status !== "ACTIVE" && <p className="caption text-ink-muted">Sube las fotos que faltan para habilitar «Publicar».</p>}
      </section>

      <section aria-labelledby="det-title" className="space-y-5">
        <h2 id="det-title" className="display-sm">
          Datos del producto
        </h2>
        {refsError && <Alert>{refsError}</Alert>}
        {!refs && !refsError && <Loading what="marcas y categorías" />}
        {refs && <ProductForm product={product} brands={refs.brands} categories={refs.categories} onSubmit={save} submitLabel="Guardar cambios" />}
      </section>

      <VariantsEditor product={product} onChange={setProduct} />
      <ImagesEditor product={product} onChange={setProduct} />

      <section aria-labelledby="del-title" className="border-line space-y-2 border-t pt-6">
        <h2 id="del-title" className="label">
          Eliminar producto
        </h2>
        <p className="body-sm text-ink-muted">Se borra con sus tallas y fotos. Si alguna talla ya tuvo stock o pedidos no se puede eliminar, porque su historial de inventario no se borra: archívalo para sacarlo de la tienda.</p>
        <ConfirmButton label="Eliminar este producto" confirmLabel="Sí, eliminar para siempre" onConfirm={remove} />
      </section>
    </div>
  );
}
