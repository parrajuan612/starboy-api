import { redirect } from "next/navigation";

/** «Rastrear mi encargo» (pie de página): el seguimiento vive en la cuenta. proxy.ts pide iniciar sesión si hace falta. */
export default function TrackImportPage() {
  redirect("/cuenta/encargos");
}
