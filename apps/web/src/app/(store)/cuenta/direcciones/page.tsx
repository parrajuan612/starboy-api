import type { Metadata } from "next";

import { AddressesView } from "@/components/account/AddressesView";

export const metadata: Metadata = { title: "Direcciones" };

export default function AddressesPage() {
  return <AddressesView />;
}
