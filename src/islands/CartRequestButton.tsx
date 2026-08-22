import { useStore } from '@nanostores/preact';
import { $cart } from '../stores/cart';
import { site } from '../config/site';
import { buildRequest } from '../services/whatsapp/WhatsAppMessageBuilder';
import { cartCount, cartTotal } from '../domain/cart';
import { track } from '../services/analytics/AnalyticsService';

/** Único botón "Solicitar compra por WhatsApp". Usa el servicio centralizado. */
export default function CartRequestButton({ source }: { source: 'cart' }) {
  const cart = useStore($cart);
  const req = buildRequest(cart, { phone: site.whatsappNumber });
  const disabled = cart.items.length === 0;
  const onClick = () => {
    track({
      name: 'purchase_request',
      items: cartCount(cart),
      value: cartTotal(cart).amount,
      models: cart.items.filter((i) => i.kind === 'product').map((i) => i.slug),
    });
    track({ name: 'whatsapp_click', source });
  };
  return (
    <a
      href={disabled ? undefined : req.url}
      class="btn btn--whatsapp btn--lg btn--block"
      target="_blank"
      rel="noopener"
      aria-disabled={disabled}
      onClick={onClick}
      data-cart-request
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.5.2-.4.7-1.4.1-.2 0-.4 0-.5L10.6 9c-.2-.5-.4-.5-.6-.5h-1z" />
      </svg>
      Solicitar compra por WhatsApp
    </a>
  );
}
