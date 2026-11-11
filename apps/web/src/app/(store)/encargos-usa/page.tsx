import type { Metadata } from "next";

import { EstimateCalculator } from "@/components/imports/EstimateCalculator";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = {
  title: "Encargos USA",
  description: "Traemos cualquier referencia de EE. UU. hasta tu puerta en Colombia. Calcula tu estimado y pide tu cotización.",
};

const STEPS = [
  { n: "1", title: "Pega el enlace", text: "Nos dices qué quieres, en qué talla y en qué tienda de EE. UU. está." },
  { n: "2", title: "Recibe tu cotización", text: "Te enviamos el valor final, todo incluido, válido por 48 horas." },
  { n: "3", title: "Acepta y paga el anticipo", text: "Con el anticipo compramos tu producto. El saldo se paga cuando llegue a Colombia." },
  { n: "4", title: "Sigue tu encargo", text: "Ves cada paso en tu cuenta: compra, bodega, tránsito, aduana y entrega." },
];

export default function ImportsLandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <header className="max-w-2xl">
        <p className="label text-ink-muted mb-2">Encargos USA</p>
        <h1 className="display-lg">Traemos cualquier referencia</h1>
        <p className="body mt-4">Si está en una tienda de EE. UU., te la traemos: 100 % original y hasta tu puerta en cualquier parte de Colombia.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/encargos-usa/cotizar">Solicitar cotización</ButtonLink>
          <ButtonLink href="/cuenta/encargos" variant="secondary">
            Rastrear mi encargo
          </ButtonLink>
        </div>
      </header>

      <section aria-labelledby="how" className="mt-16">
        <h2 id="how" className="display-md">
          ¿Cómo funciona?
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="border-line border-t-2 pt-4">
              <span className="display-sm text-accent">{s.n}</span>
              <h3 className="body-strong mt-1">{s.title}</h3>
              <p className="body-sm text-ink-muted mt-1">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="calc" className="mt-16">
        <h2 id="calc" className="display-md">
          Calcula tu estimado
        </h2>
        <p className="body text-ink-muted mt-2 max-w-xl">Mira cuánto costaría traer tu producto, con el dólar y las tarifas de hoy.</p>
        <div className="mt-8">
          <EstimateCalculator />
        </div>
      </section>

      <section id="tiempos" aria-labelledby="times" className="mt-16 scroll-mt-24">
        <h2 id="times" className="display-md">
          Tiempo de entrega
        </h2>
        <p className="body text-ink-muted mt-2 max-w-2xl">
          El tiempo depende del producto, la tienda y la aduana. Cuando tu encargo avanza, registramos cada paso y la fecha estimada de llegada en tu cuenta, para que sepas siempre dónde está. Nada se compra sin tu anticipo y nada se despacha sin que el saldo esté al día.
        </p>
      </section>
    </div>
  );
}
