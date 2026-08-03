export type EawbCounty = {
  id: number | string | null;
  code: string;
  name: string;
};

export type EawbLocality = {
  id: number | string | null;
  name: string;
  county: string;
  county_code?: string | null;
  name_and_county?: string;
  commune?: string | null;
  postal_code?: string | null;
  street_name?: string | null;
};

export function localityPrimaryLabel(l: EawbLocality): string {
  return l.name || l.name_and_county || 'Locality';
}

export function localitySecondaryLines(l: EawbLocality): string[] {
  const lines: string[] = [];
  if (l.commune && l.commune.toLowerCase() !== l.name.toLowerCase()) {
    lines.push(`Commune: ${l.commune}`);
  }
  if (l.county) lines.push(l.county);
  if (l.postal_code) lines.push(`Postal: ${l.postal_code}`);
  return lines;
}

export function localitySearchHaystack(l: EawbLocality): string {
  return [l.name, l.commune, l.county, l.name_and_county, l.postal_code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
