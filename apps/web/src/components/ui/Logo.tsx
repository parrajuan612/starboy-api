import Link from 'next/link';

export function Logo() {
  return (
    <Link className="inline-flex items-center gap-1 text-white font-display tracking-wider text-xl uppercase transition-opacity hover:opacity-90" href="/">
      <span>ST</span>
      <span className="text-brand-accent">★</span>
      <span>BOY</span>
    </Link>
  );
}
