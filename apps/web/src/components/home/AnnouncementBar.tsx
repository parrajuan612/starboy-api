import { SmartLink } from "./SmartLink";

/** Franja de aviso sobre el encabezado (texto y enlace editables desde el panel). */
export function AnnouncementBar({ text, url }: { text: string; url: string }) {
  return (
    <div className="bg-brand text-on-brand">
      <SmartLink href={url} className="label mx-auto flex min-h-9 max-w-7xl items-center justify-center px-4 py-2 text-center md:px-8">
        <span className={url ? "underline underline-offset-4" : undefined}>{text}</span>
      </SmartLink>
    </div>
  );
}
