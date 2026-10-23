import { useStore } from '@nanostores/preact';
import { $toast } from '../stores/toast';

export default function Toaster() {
  const t = useStore($toast);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {t && (
        <div class="toast" key={t.id}>
          {t.text}
          {t.actionHref && (
            <>
              {' · '}
              <a href={t.actionHref} style="color:var(--accent-text);font-weight:600">
                {t.actionLabel}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
