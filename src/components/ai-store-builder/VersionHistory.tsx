import { Button } from '@/components/ui/button';
import type { VersionSummary } from '@/lib/ai-store-builder/cursorGateway';

type Props = {
  versions: VersionSummary[];
  currentDraftId?: string | null;
  viewingVersionId?: string | null;
  onRestore: (versionId: string) => void;
  onPreview?: (versionId: string) => void;
  busy?: boolean;
};

export default function VersionHistory({
  versions,
  currentDraftId,
  viewingVersionId,
  onRestore,
  onPreview,
  busy,
}: Props) {
  if (!versions.length) {
    return <p className="text-sm text-muted-foreground">No versions yet.</p>;
  }

  return (
    <div className="sv-cursor-versions">
      {versions.map((v) => {
        const current = v.id === currentDraftId;
        const viewing = v.id === viewingVersionId;
        return (
          <div
            key={v.id}
            className="sv-cursor-version-row"
            data-current={current ? 'true' : 'false'}
            data-viewing={viewing && !current ? 'true' : 'false'}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {current ? 'Current — ' : ''}
                  {v.display_label || `v${v.version_number}`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()}
                  {viewing && !current ? ' · viewing' : ''}
                </p>
              </div>
              {v.status === 'stored' && v.build_status === 'ready' && (
                <div className="flex shrink-0 flex-col gap-1">
                  {!current && onPreview && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => onPreview(v.id)}
                    >
                      Preview
                    </Button>
                  )}
                  {!current && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => {
                        if (
                          typeof window !== 'undefined' &&
                          !window.confirm('Restore this version as your current draft?')
                        ) {
                          return;
                        }
                        onRestore(v.id);
                      }}
                    >
                      Restore as current draft
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
