const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Pesos colombianos enteros (la API los entrega como int64 sin decimales): 600000 → "$ 600.000". */
export const formatCOP = (value: number): string => cop.format(value);

/** La API entrega dólares en centavos: 12999 → "$129.99". */
export const formatUSD = (cents: number): string => usd.format(cents / 100);

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(
    new Date(iso),
  );
