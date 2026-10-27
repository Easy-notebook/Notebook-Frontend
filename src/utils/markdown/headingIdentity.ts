/** Preserve existing heading URLs while counting collisions by normalized key. */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export function nextHeadingOccurrence(base: string, counters?: Map<string, number>) {
  const occurrence = (counters?.get(base) ?? 0) + 1;
  counters?.set(base, occurrence);
  return { key: occurrence > 1 ? `${base}-${occurrence}` : base, occurrence };
}

export function nextHeadingIdentity(text: string, counters?: Map<string, number>) {
  return nextHeadingOccurrence(headingSlug(text), counters);
}

export function indexHeadingTargets(
  base: string,
  headings: readonly { id: string; title: string }[]
) {
  const counters = new Map<string, number>();
  return new Map(
    headings.map((heading) => [
      heading.id,
      `${base}--${nextHeadingIdentity(heading.title, counters).key}`,
    ])
  );
}
