import { useState } from 'preact/hooks';
import { site } from '../config/site';
import { buildContactMessage, buildMailto, buildUrl, CONTACT_SUBJECTS, type ContactSubject } from '../services/whatsapp/WhatsAppMessageBuilder';
import { track } from '../services/analytics/AnalyticsService';

/**
 * Formulario de /contacto SIN backend: valida en cliente, compone el mensaje con
 * WhatsAppMessageBuilder y abre wa.me en una pestaña nueva (o mailto como alternativa).
 * No almacena ni envía datos a ningún servidor propio.
 */
interface Errors {
  name?: string;
  phone?: string;
  message?: string;
}

const PHONE_RE = /^\+?[\d\s().-]{6,20}$/;

export default function ContactForm() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState<ContactSubject>('Compra');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState<'whatsapp' | 'email' | null>(null);

  function validate(): boolean {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Escribe tu nombre.';
    if (phone.trim() && !PHONE_RE.test(phone.trim())) e.phone = 'Revisa el número de teléfono.';
    if (message.trim().length < 10) e.message = 'Cuéntanos un poco más (mínimo 10 caracteres).';
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0]!;
      document.getElementById(`cf-${first}`)?.focus();
      return false;
    }
    return true;
  }

  const text = () => buildContactMessage({ name, phone, subject, message });

  const sendWhatsApp = (e: Event) => {
    e.preventDefault();
    if (!validate()) return;
    track({ name: 'whatsapp_click', source: 'contact' });
    window.open(buildUrl(site.whatsappNumber, text()), '_blank', 'noopener,noreferrer');
    setSent('whatsapp');
  };

  const sendEmail = () => {
    if (!validate()) return;
    window.location.href = buildMailto(site.contactEmail, `[Web] ${subject} — ${name.trim()}`, text());
    setSent('email');
  };

  return (
    <form class="cf" onSubmit={sendWhatsApp} noValidate data-contact-form>
      <div class="cf__row">
        <label class="field">
          <span class="label">Nombre *</span>
          <input
            id="cf-name"
            class="input"
            type="text"
            name="nombre"
            autocomplete="name"
            required
            maxLength={80}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? 'cf-name-err' : undefined}
          />
          {errors.name && (
            <span class="cf__err" id="cf-name-err" role="alert">
              {errors.name}
            </span>
          )}
        </label>
        <label class="field">
          <span class="label">Teléfono (opcional)</span>
          <input
            id="cf-phone"
            class="input"
            type="tel"
            name="telefono"
            autocomplete="tel"
            inputMode="tel"
            placeholder="+51 9__ ___ ___"
            maxLength={24}
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            aria-invalid={errors.phone ? 'true' : undefined}
            aria-describedby={errors.phone ? 'cf-phone-err' : undefined}
          />
          {errors.phone && (
            <span class="cf__err" id="cf-phone-err" role="alert">
              {errors.phone}
            </span>
          )}
        </label>
      </div>

      <label class="field">
        <span class="label">Asunto</span>
        <select class="select" name="asunto" value={subject} onChange={(e) => setSubject((e.target as HTMLSelectElement).value as ContactSubject)}>
          {CONTACT_SUBJECTS.map((s) => (
            <option value={s} key={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label class="field">
        <span class="label">Mensaje *</span>
        <textarea
          id="cf-message"
          class="textarea"
          name="mensaje"
          required
          maxLength={500}
          rows={5}
          placeholder="Modelo que te interesa, tu distrito o ciudad, y cualquier duda…"
          value={message}
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          aria-invalid={errors.message ? 'true' : undefined}
          aria-describedby={errors.message ? 'cf-message-err' : 'cf-message-hint'}
        />
        {errors.message ? (
          <span class="cf__err" id="cf-message-err" role="alert">
            {errors.message}
          </span>
        ) : (
          <span class="hint" id="cf-message-hint">
            {message.length}/500
          </span>
        )}
      </label>

      <div class="cf__actions">
        <button type="submit" class="btn btn--whatsapp btn--lg" data-contact-whatsapp>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3 4.4c-.2 0-.5 0-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.1l-1 1.2c-.2.2-.3.2-.6.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.5.2-.4.7-1.4.1-.2 0-.4 0-.5L10.6 9c-.2-.5-.4-.5-.6-.5h-1z" />
          </svg>
          Enviar por WhatsApp
        </button>
        <button type="button" class="btn btn--secondary btn--lg" onClick={sendEmail} data-contact-email>
          Enviar por correo
        </button>
      </div>

      <p class="hint" aria-live="polite">
        {sent === 'whatsapp'
          ? 'Se abrió WhatsApp con tu mensaje. Si no se abrió, revisa el bloqueo de ventanas emergentes.'
          : sent === 'email'
            ? 'Se abrió tu aplicación de correo con el mensaje preparado.'
            : 'El mensaje se abre en tu WhatsApp o correo para que lo envíes tú. No guardamos tus datos en esta web.'}
      </p>
    </form>
  );
}
