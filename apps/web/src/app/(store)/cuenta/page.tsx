import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/ProfileForm";

export const metadata: Metadata = { title: "Perfil" };

export default function AccountPage() {
  return <ProfileForm />;
}
