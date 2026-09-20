import { useState, type FormEvent } from 'react';
import { useCart, useCheckout } from '../speedvendors';
import { formatPrice } from './ProductCard';

interface CheckoutFormProps {
  onBack: () => void;
}

/** Design layer for checkout. All order logic stays behind useCheckout(). */
export default function CheckoutForm({ onBack }: CheckoutFormProps) {
  const { cart } = useCart();
  const { submit } = useCheckout();
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await submit({ ...form, paymentMethod });
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
        <button className="sf-btn" onClick={onBack}>
          Continue shopping
        </button>
      </section>
    );
  }

  return (
    <section className="sf-section sf-narrow">
      <button className="sf-link" onClick={onBack}>
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
          <input value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </label>
        <label>
          Delivery address
          <textarea value={form.address} onChange={set('address')} rows={3} required />
        </label>
        <label>
          Notes (optional)
          <textarea value={form.notes} onChange={set('notes')} rows={2} />
        </label>
        <fieldset>
          <legend>Payment</legend>
          <label className="sf-inline">
            <input type="radio" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} /> Card
          </label>
          <label className="sf-inline">
            <input type="radio" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} /> Cash on delivery
          </label>
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
