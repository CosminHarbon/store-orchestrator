type Props = {
  data: Record<string, unknown> | null;
};

/** Superadmin-only debug blob from gateway status (may include chargedCents). */
export default function AdminDebug({ data }: Props) {
  if (!data) return null;
  return (
    <pre className="sv-cursor-admin" aria-label="Admin debug">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
