import Image from "next/image";

import { shouldOptimize } from "@/lib/image";

interface Props {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/** Foto de producto que llena su contenedor (el contenedor define la proporción: 1:1 sobre blanco). */
export function ProductImage({ src, alt, sizes, priority, className }: Props) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={!shouldOptimize(src)}
      className={`object-contain ${className ?? ""}`}
    />
  );
}
