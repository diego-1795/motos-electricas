import { useStore } from '@nanostores/preact';
import { $toast, dismissToast, pauseToast, resumeToast } from '../stores/toast';

export default function Toaster() {
  const t = useStore($toast);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {t && (
        <div class="toast" key={t.id} onMouseEnter={pauseToast} onMouseLeave={resumeToast} onFocusIn={pauseToast} onFocusOut={resumeToast}>
          <span>
            {t.text}
            {t.actionHref && (
              <>
                {' · '}
                <a href={t.actionHref} style="color:var(--accent-text);font-weight:600">
                  {t.actionLabel}
                </a>
              </>
            )}
          </span>
          <button type="button" class="toast__close" onClick={dismissToast} aria-label="Cerrar aviso">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
