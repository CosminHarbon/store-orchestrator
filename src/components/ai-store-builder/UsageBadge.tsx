type Props = {
  available?: boolean;
  exhausted?: boolean;
  low?: boolean;
  runsUsed?: number | null;
  maxRuns?: number | null;
};

export default function UsageBadge({ available, exhausted, low, runsUsed, maxRuns }: Props) {
  const tone = exhausted ? 'exhausted' : low ? 'low' : 'ok';
  let label = 'AI ready';
  if (exhausted) label = 'AI limit reached';
  else if (low) label = 'AI usage running low';
  else if (typeof runsUsed === 'number' && typeof maxRuns === 'number' && maxRuns > 0) {
    label = `${runsUsed}/${maxRuns} runs`;
  } else if (available === false) {
    label = 'AI unavailable';
  }

  return (
    <span className="sv-cursor-usage" data-tone={tone}>
      {label}
    </span>
  );
}
