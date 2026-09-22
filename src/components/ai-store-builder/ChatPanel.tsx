import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ConversationMessage } from '@/lib/ai-store-builder/cursorGateway';
import ProgressBanner from './ProgressBanner';
import type { UiStage } from '@/lib/ai-store-builder/builderState';

type Props = {
  messages: ConversationMessage[];
  busy: boolean;
  stage: UiStage;
  onSend: (text: string) => void;
  onCancel?: () => void;
  error?: string | null;
  hidden?: boolean;
  exhausted?: boolean;
};

export default function ChatPanel({
  messages,
  busy,
  stage,
  onSend,
  onCancel,
  error,
  hidden,
  exhausted,
}: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, stage.id]);

  const locked = busy || Boolean(exhausted);

  const submit = () => {
    const t = input.trim();
    if (!t || locked) return;
    setInput('');
    onSend(t);
  };

  return (
    <aside className="sv-cursor-builder__chat" data-hidden={hidden ? 'true' : undefined}>
      <ProgressBanner stage={stage} busy={busy} onCancel={onCancel} />
      {error && (
        <div className="mx-3 mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}
      <div className="sv-cursor-builder__messages" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Tell the AI what to change — colors, hero, product grid, copy…
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={`sv-cursor-msg sv-cursor-msg--${m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant'}`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="sv-cursor-builder__composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask AI to change your store…"
          disabled={locked}
          aria-label="Ask AI to change your store"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled
            title="Coming soon"
            className="text-muted-foreground"
          >
            <Paperclip className="mr-1 h-3.5 w-3.5" />
            Attach (soon)
          </Button>
          <Button
            className="ml-auto rounded-full bg-[#6E3DFF] hover:bg-[#5b30e0]"
            size="sm"
            disabled={locked || !input.trim()}
            onClick={submit}
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
