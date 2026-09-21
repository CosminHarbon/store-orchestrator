// PROTECTED: storefront footer. Cursor may not edit this file.
import type { Merchant } from '../types';

export interface FooterProps {
  merchant: Merchant | null;
}

export default function Footer({ merchant }: FooterProps) {
  return (
    <footer className="sf-footer">
      <span>{merchant?.name}</span>
      <span className="sf-muted">{merchant?.contactEmail}</span>
    </footer>
  );
}
