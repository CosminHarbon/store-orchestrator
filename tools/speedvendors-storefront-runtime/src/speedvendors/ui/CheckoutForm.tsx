// PROTECTED: COD checkout form — structured address only. Cursor may not edit this file.
import { useState, type FormEvent } from 'react';
import { useCart, useCheckout } from '../hooks';
import { formatPrice } from './formatMoney';

export interface CheckoutFormProps {
  onBack: () => void;
}

/** Design layer for checkout. All order logic stays behind useCheckout(). */
export default function CheckoutForm({ onBack }: CheckoutFormProps) {
  const { cart } = useCart();
  const { submit } = useCheckout();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    streetNumber: '',
    city: '',
    county: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await submit({ ...form, paymentMethod: 'cash' });
    setBusy(false);
    if (result.ok) setDone({ orderId: result.orderId, message: result.message });
    else setError(result.error);
  }

  if (done) {
    return (
      <section className="sf-section sf-narrow">
        <h1>Thank you</h1>
        <p>
          Order <strong>{done.orderId}</strong> received.
        </p>
        <p className="sf-muted">{done.message}</p>
        <button type="button" className="sf-btn" onClick={onBack}>
          Continue shopping
        </button>
      </section>
    );
  }

  return (
    <section className="sf-section sf-narrow">
      <button type="button" className="sf-link" onClick={onBack}>
        ← Back
      </button>
      <h1>Checkout</h1>
      <form className="sf-form" onSubmit={onSubmit}>
        <label>
          Full name
          <input value={form.name} onChange={set('name')} autoComplete="name" required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={set('phone')} autoComplete="tel" required />
        </label>
        <label>
          Street
          <input value={form.street} onChange={set('street')} autoComplete="street-address" required />
        </label>
        <label>
          Street number
          <input value={form.streetNumber} onChange={set('streetNumber')} required />
        </label>
        <label>
          City
          <input value={form.city} onChange={set('city')} autoComplete="address-level2" required />
        </label>
        <label>
          County
          <input value={form.county} onChange={set('county')} autoComplete="address-level1" required />
        </label>
        <label>
          Notes (optional)
          <textarea value={form.notes} onChange={set('notes')} rows={2} />
        </label>
        <fieldset>
          <legend>Payment</legend>
          <p className="sf-muted">Cash on delivery</p>
        </fieldset>
        <p className="sf-subtotal">
          <span>Total ({cart.itemCount} items)</span>
          <strong>{formatPrice(cart.subtotal.amount, cart.subtotal.currency)}</strong>
        </p>
        {error && (
          <p className="sf-error" role="alert">
            {error}
          </p>
        )}
        <button className="sf-btn" type="submit" disabled={busy}>
          {busy ? 'Placing order…' : 'Place order'}
        </button>
      </form>
    </section>
  );
}
