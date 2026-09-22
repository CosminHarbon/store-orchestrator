// PROTECTED: checkout entry — opens CheckoutForm or submits structured COD fields.
// Cursor may not edit this file.
import { useState } from 'react';
import { useCheckout } from '../hooks';
import type { CheckoutInput } from '../types';

export type CheckoutButtonMode = 'openForm' | 'submit';

export interface CheckoutButtonProps {
  /** openForm → call onOpenForm (navigate to protected CheckoutForm). submit → useCheckout().submit */
  mode?: CheckoutButtonMode;
  /** Required when mode === 'submit'. Must include structured COD address + paymentMethod: 'cash'. */
  fields?: CheckoutInput;
  onOpenForm?: () => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export default function CheckoutButton({
  mode = 'openForm',
  fields,
  onOpenForm,
  label = 'Checkout',
  className = 'sf-btn',
  disabled = false,
}: CheckoutButtonProps) {
  const { submit } = useCheckout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    if (mode === 'openForm') {
      onOpenForm?.();
      return;
    }
    if (!fields) {
      setError('Checkout fields are required');
      return;
    }
    setBusy(true);
    const result = await submit({ ...fields, paymentMethod: 'cash' });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="sf-checkout-btn-wrap">
      <button type="button" className={className} disabled={disabled || busy} onClick={onClick}>
        {busy ? 'Placing order…' : label}
      </button>
      {error && (
        <p className="sf-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
