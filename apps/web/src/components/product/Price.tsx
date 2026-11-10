import { formatCOP } from "@/lib/format";

interface Props {
  price: number;
  compareAt?: number;
  size?: "card" | "pdp";
}

/** Precio final y, si hay promoción, el anterior tachado. El tachado lleva texto oculto para lectores de pantalla. */
export function Price({ price, compareAt = 0, size = "card" }: Props) {
  const onSale = compareAt > price;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span className={size === "pdp" ? "price-lg" : "body-strong tabular-nums"}>
        <span className="sr-only">Precio: </span>
        {formatCOP(price)}
      </span>
      {onSale && (
        <s className="body-sm text-ink-muted tabular-nums">
          <span className="sr-only">Precio anterior: </span>
          {formatCOP(compareAt)}
        </s>
      )}
    </p>
  );
}
