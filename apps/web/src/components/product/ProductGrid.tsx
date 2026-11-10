import type { ProductSummary } from "@/types";

import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-3">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 3} />
        </li>
      ))}
    </ul>
  );
}
