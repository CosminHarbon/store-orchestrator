import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { payloadFromFunctionsInvoke } from '@/lib/edgeFunctionPayload';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ERROR_COPY: Record<string, string> = {
  active_subscription:
    'This account has an open SpeedVendors subscription. Cancel it in Stripe first so the customer is not billed after deletion.',
  cannot_delete_self: 'You cannot delete your own account.',
  cannot_delete_superadmin: 'Superadmin accounts cannot be deleted from here.',
  reauth_required: 'Authenticator verification is required. Enter a fresh code and try again.',
  email_confirmation_mismatch: 'The email you typed does not match this account.',
  confirmation_phrase_mismatch: 'The confirmation phrase does not match.',
  user_not_found: 'That user no longer exists.',
  forbidden: 'You are not authorised to delete accounts.',
  archive_failed: 'Could not archive retained records, so nothing was deleted.',
  audit_unavailable: 'The audit log is unavailable, so nothing was deleted.',
  delete_failed: 'The account could not be deleted. Nothing further was changed; see the audit log.',
};

type Step = 1 | 2 | 3;

/**
 * Three-step account deletion. Every guard here is repeated server-side in the
 * `admin-delete-user` Edge Function (typed email, DELETE phrase, acknowledgement, recent MFA,
 * superadmin + AAL2), so this flow cannot be bypassed by calling the endpoint directly.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  userId,
  email,
  storeName,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  email: string;
  storeName: string | null;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [ack, setAck] = useState(false);
  const [typedEmail, setTypedEmail] = useState('');
  const [phrase, setPhrase] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setAck(false);
      setTypedEmail('');
      setPhrase('');
      setCode('');
      setBusy(false);
      setError(null);
    }
  }, [open, userId]);

  const emailMatches = email.length > 0 && typedEmail === email;
  const phraseMatches = phrase === 'DELETE';
  const codeValid = /^\d{6}$/.test(code);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Fresh MFA proof immediately before the destructive call (recent authentication).
      const { data: factors, error: factorErr } = await supabase.auth.mfa.listFactors();
      if (factorErr) throw new Error('Could not load your authenticator.');
      const totp = factors?.totp?.find((f) => f.status === 'verified');
      if (!totp) throw new Error('No verified authenticator on this account.');
      const { error: mfaErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totp.id,
        code,
      });
      if (mfaErr) throw new Error('Authenticator code rejected. Try the next code.');

      const { data, error: fnErr } = await supabase.functions.invoke('admin-delete-user', {
        body: {
          target_user_id: userId,
          acknowledged: true,
          confirm_email: typedEmail,
          confirm_phrase: phrase,
        },
      });
      const payload = await payloadFromFunctionsInvoke(data, fnErr);
      const code_ = typeof payload.error === 'string' ? payload.error : '';
      if (code_) {
        throw new Error(
          typeof payload.message === 'string' && code_ === 'active_subscription'
            ? payload.message
            : ERROR_COPY[code_] || `Deletion failed (${code_}).`,
        );
      }
      if (fnErr && payload.ok !== true) throw new Error('Deletion failed.');

      toast.success(`Account ${email} permanently deleted.`);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed.');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        className="sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete account — step {step} of 3</DialogTitle>
          <DialogDescription>
            {email}
            {storeName ? ` · ${storeName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-2">
              <p className="font-medium">This is permanent.</p>
              <p>
                The sign-in account and associated merchant data (store, products, customers, settings, media,
                integrations) may be permanently deleted and cannot be recovered.
              </p>
              <p className="text-muted-foreground">
                Paid and invoiced orders, their items and payments, and billing history are copied to a
                restricted retention archive before deletion. Accounts with an open subscription are refused.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox id="del-ack" checked={ack} onCheckedChange={(v) => setAck(v === true)} />
              <Label htmlFor="del-ack" className="leading-snug font-normal">
                I understand this action may permanently delete user data.
              </Label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-2 text-sm">
            <Label htmlFor="del-email">
              Type the account&apos;s exact email address to continue:{' '}
              <span className="font-mono">{email}</span>
            </Label>
            <Input
              id="del-email"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onPaste={(e) => e.preventDefault()}
              placeholder="email@example.com"
            />
            {typedEmail.length > 0 && !emailMatches ? (
              <p className="text-xs text-muted-foreground">Does not match yet.</p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <Label htmlFor="del-phrase">
                Type <span className="font-mono font-semibold">DELETE</span> to confirm
              </Label>
              <Input
                id="del-phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                onPaste={(e) => e.preventDefault()}
                placeholder="DELETE"
              />
            </div>
            {phraseMatches ? (
              <div className="space-y-2">
                <Label htmlFor="del-code">Re-authenticate: 6-digit authenticator code</Label>
                <Input
                  id="del-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="font-mono tracking-widest"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button variant="outline" disabled={!ack} onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : null}
          {step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="outline" disabled={!emailMatches} onClick={() => setStep(3)}>
                Continue
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setStep(2)}>
                Back
              </Button>
              {phraseMatches ? (
                <Button variant="destructive" disabled={busy || !codeValid} onClick={() => void submit()}>
                  {busy ? 'Deleting…' : 'Permanently delete account'}
                </Button>
              ) : null}
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
