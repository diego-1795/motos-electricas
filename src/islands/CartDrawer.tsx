import { useStore } from '@nanostores/preact';
import { useEffect, useRef } from 'preact/hooks';
import { $cart, $cartOpen, $cartTotal, closeCart, removeFromCart, setQuantity } from '../stores/cart';
import { formatMoney } from '../domain/money';
import { lineTotal } from '../domain/cart';
import { site } from '../config/site';
import CartRequestButton from './CartRequestButton';

/**
 * Drawer lateral del carrito. Accesible: role=dialog, foco atrapado, Esc cierra.
 * Para la página completa /carrito se usa CartPage (misma lógica, sin drawer).
 */
export default function CartDrawer() {
  const open = useStore($cartOpen);
  const cart = useStore($cart);
  const total = useStore($cartTotal);
  const panel = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    document.documentElement.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('button, a, input');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart();
      if (e.key === 'Tab' && panel.current) {
        const f = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea'));
        if (!f.length) return;
        const firstEl = f[0]!;
        const lastEl = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div class="overlay" onClick={closeCart} aria-hidden="true" />
      <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" ref={panel} data-cart-drawer>
        <header class="cd__head">
          <h2 id="cart-title" style="font-size:var(--fs-lg)">
            Tu solicitud
          </h2>
          <button type="button" class="btn btn--ghost btn--icon" onClick={closeCart} aria-label="Cerrar carrito">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div class="cd__body">
          {cart.items.length === 0 ? (
            <div class="cd__empty">
              <p class="muted">Tu carrito está vacío.</p>
              <a href="/motos-electricas" class="btn btn--secondary" onClick={closeCart}>
                Ver catálogo
              </a>
            </div>
          ) : (
            <ul role="list" class="cd__list">
              {cart.items.map((i) => (
                <li key={i.key} class="cd__item" data-cart-item>
                  <div class="cd__thumb" aria-hidden="true">
                    {i.image ? <img src={i.image.src} alt="" width="64" height="64" loading="lazy" /> : null}
                  </div>
                  <div class="cd__info">
                    <strong>{i.name}</strong>
                    <small class="muted">
                      {[i.variantName, i.colorName].filter(Boolean).join(' · ')}
                    </small>
                    <div class="cd__row">
                      <div class="stepper" aria-label={`Cantidad de ${i.name}`}>
                        <button type="button" onClick={() => setQuantity(i.key, i.quantity - 1)} aria-label="Reducir cantidad">
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={site.maxQtyPerLine}
                          value={i.quantity}
                          aria-label="Cantidad"
                          onChange={(e) => setQuantity(i.key, Number((e.target as HTMLInputElement).value))}
                        />
                        <button type="button" onClick={() => setQuantity(i.key, i.quantity + 1)} aria-label="Aumentar cantidad">
                          +
                        </button>
                      </div>
                      <span class="cd__price">{formatMoney(lineTotal(i))}</span>
                    </div>
                  </div>
                  <button type="button" class="cd__remove" onClick={() => removeFromCart(i.key)} aria-label={`Eliminar ${i.name}`} data-cart-remove>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && (
          <footer class="cd__foot">
            <div class="cd__total">
              <span>Total estimado</span>
              <strong data-cart-total>{formatMoney(total)}</strong>
            </div>
            <p class="hint">Sin pago online. Un asesor confirmará disponibilidad y condiciones por WhatsApp.</p>
            <CartRequestButton source="cart" />
            <a href="/carrito" class="btn btn--secondary btn--block" onClick={closeCart}>
              Revisar solicitud completa
            </a>
          </footer>
        )}
        <style>{`
          .cd__head{display:flex;align-items:center;justify-content:space-between;padding:var(--s-4) var(--s-5);border-bottom:1px solid var(--border)}
          .cd__body{flex:1;overflow-y:auto;padding:var(--s-4) var(--s-5)}
          .cd__empty{display:flex;flex-direction:column;gap:var(--s-4);align-items:flex-start;padding-top:var(--s-6)}
          .cd__list{display:flex;flex-direction:column;gap:var(--s-4)}
          .cd__item{display:grid;grid-template-columns:4rem 1fr auto;gap:var(--s-3);align-items:start}
          .cd__thumb{width:4rem;height:4rem;border-radius:var(--r-md);background:var(--bg-sunken);overflow:hidden}
          .cd__thumb img{width:100%;height:100%;object-fit:cover}
          .cd__info{display:flex;flex-direction:column;gap:var(--s-1);min-width:0}
          .cd__row{display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);margin-top:var(--s-2);flex-wrap:wrap}
          .cd__price{font-weight:600}
          .cd__remove{color:var(--fg-muted);padding:var(--s-2);border-radius:var(--r-md)}
          .cd__remove:hover{color:var(--danger);background:var(--bg-sunken)}
          .cd__foot{padding:var(--s-4) var(--s-5) calc(var(--s-5) + env(safe-area-inset-bottom));border-top:1px solid var(--border);display:flex;flex-direction:column;gap:var(--s-3)}
          .cd__total{display:flex;justify-content:space-between;align-items:baseline;font-size:var(--fs-lg)}
        `}</style>
      </div>
    </>
  );
}
