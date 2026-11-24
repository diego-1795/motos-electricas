import { describe, it, expect } from 'vitest';
import {
  CONTACT_SUBJECTS,
  SUPPORT_MESSAGE,
  buildContactMessage,
  buildInquiryMessage,
  buildMailto,
  buildMessage,
  buildRequest,
  buildUrl,
  formatItem,
  sanitizeNotes,
  type ContactFormData,
} from '../../src/services/whatsapp/WhatsAppMessageBuilder';
import { addItem, emptyCart } from '../../src/domain/cart';
import { bikeItem, cartWith, norm, partItem } from './fixtures';

const MAX = 10;
const fullCart = (notes = '') => {
  let c = addItem(emptyCart(), bikeItem({ quantity: 2 }), MAX);
  c = addItem(c, partItem('bateria-48v-20ah', 'Batería 48V 20Ah', 45000), MAX);
  c = addItem(c, partItem('casco', 'Casco integral', 12900, 2), MAX);
  return { ...c, notes };
};

describe('buildMessage', () => {
  it('estructura completa: saludo, producto, repuestos con iconos, total, notas y cierre', () => {
    const msg = norm(buildMessage(fullCart('Entrega en Lima')));
    // 2 × 1,500 + 450 + 2 × 129 = S/ 3,708
    expect(msg).toBe(
      [
        'Hola 👋\nEstoy interesado en realizar el siguiente pedido:',
        '🏍️ Águila Test\nVariante: Premium\nColor: Negro\nCantidad: 2',
        '🔋 Batería 48V 20Ah\nCantidad: 1',
        '🪖 Casco integral\nCantidad: 2',
        '💰 Total estimado: S/ 3,708',
        '📝 Notas: Entrega en Lima',
        '¿Pueden confirmarme disponibilidad y condiciones de compra?',
      ].join('\n\n'),
    );
  });

  it('omite el bloque de notas cuando están vacías o son solo espacios', () => {
    expect(buildMessage(fullCart(''))).not.toContain('Notas');
    expect(buildMessage(fullCart('  \n '))).not.toContain('Notas');
  });

  it('los productos van antes que los repuestos aunque se añadieran después', () => {
    let c = addItem(emptyCart(), partItem('casco', 'Casco', 100), MAX);
    c = addItem(c, bikeItem(), MAX);
    const msg = buildMessage(c);
    expect(msg.indexOf('🏍️ Águila Test')).toBeLessThan(msg.indexOf('🪖 Casco'));
  });

  it('acepta saludo y cierre personalizados', () => {
    const msg = buildMessage(cartWith([]), { greeting: 'Hey', closing: 'Bye' });
    expect(msg.startsWith('Hey\n\n')).toBe(true);
    expect(msg.endsWith('\n\nBye')).toBe(true);
  });

  it('carrito vacío → total S/ 0', () => {
    expect(norm(buildMessage(emptyCart()))).toContain('💰 Total estimado: S/ 0');
  });

  it('tolera notes undefined en carritos antiguos', () => {
    const c = { ...emptyCart(), notes: undefined as unknown as string };
    expect(() => buildMessage(c)).not.toThrow();
  });

  it('nunca usa el símbolo de euro ni "Podéis" (mercado Perú)', () => {
    const msg = buildMessage(fullCart('x'));
    expect(msg).not.toContain('€');
    expect(msg).not.toMatch(/podéis/i);
  });
});

describe('formatItem', () => {
  it('producto sin variante ni color solo muestra nombre y cantidad', () => {
    const item = { ...bikeItem({ variantName: undefined, colorName: undefined }), key: 'k' };
    expect(formatItem(item)).toBe('🏍️ Águila Test\nCantidad: 1');
  });
  it('iconos por tipo de repuesto', () => {
    const mk = (name: string) => ({ ...partItem('x', name, 1), key: 'k' });
    expect(formatItem(mk('Batería Chilwee 48V 12Ah'))).toMatch(/^🔋/);
    expect(formatItem(mk('Cargador 48V 12Ah'))).toMatch(/^🔌/);
    expect(formatItem(mk('Baúl trasero'))).toMatch(/^🧳/);
    expect(formatItem(mk('Alarma 350W'))).toMatch(/^🔒/);
    expect(formatItem(mk('Motor 350 W'))).toMatch(/^🧩/);
  });
});

describe('sanitizeNotes', () => {
  it('elimina caracteres de control', () => {
    expect(sanitizeNotes('ho\u0000\u0007la\u001F mundo\u007F')).toBe('hola mundo');
  });
  it('colapsa saltos de línea (y espacios alrededor) en un espacio', () => {
    expect(sanitizeNotes('línea 1 \n\n  línea 2\r\n línea 3')).toBe('línea 1 línea 2 línea 3');
  });
  it('recorta espacios y limita a 500', () => {
    expect(sanitizeNotes('   hola   ')).toBe('hola');
    expect(sanitizeNotes('a'.repeat(800))).toHaveLength(500);
  });
  it('conserva tabuladores y acentos', () => {
    expect(sanitizeNotes('a\tb ñ')).toBe('a\tb ñ');
  });
});

describe('buildUrl', () => {
  it('elimina no dígitos del teléfono y codifica el mensaje', () => {
    const url = buildUrl('+51 900-000.000', 'Hola 👋 ¿qué tal?');
    expect(url.startsWith('https://api.whatsapp.com/send?phone=51900000000&text=Hola%20%F0%9F%91%8B')).toBe(true);
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe('Hola 👋 ¿qué tal?');
  });
  it('codifica saltos de línea y & correctamente', () => {
    const url = buildUrl('51900000000', 'a\nb&c');
    expect(url.endsWith('&text=a%0Ab%26c')).toBe(true);
  });
  it('no usa wa.me: su redirección cambia los emojis por "�" (ADR-028); los emojis viajan en UTF-8 intactos', () => {
    const msg = 'Hola 👋\n🏍️ Golden Eagle\n💰 Total estimado: S/ 1,500';
    const url = buildUrl('51900000000', msg);
    expect(url).not.toContain('wa.me');
    expect(url).not.toContain('%EF%BF%BD');
    expect(url).toContain('%F0%9F%8F%8D%EF%B8%8F'); // 🏍️ con su selector de variación
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe(msg);
  });
});

describe('buildInquiryMessage', () => {
  it('con y sin variante', () => {
    expect(buildInquiryMessage('Golden Eagle')).toBe(
      'Hola 👋\nMe interesa el modelo Golden Eagle. ¿Pueden darme más información sobre disponibilidad, precio y condiciones de compra?',
    );
    expect(buildInquiryMessage('Golden Eagle', 'Premium')).toContain('Golden Eagle (Premium).');
  });
});

describe('buildRequest', () => {
  it('devuelve teléfono, mensaje y url coherentes', () => {
    const req = buildRequest(fullCart('Entrega en Lima'), { phone: '51900000000' });
    expect(req.phone).toBe('51900000000');
    expect(req.message).toContain('Estoy interesado en realizar el siguiente pedido');
    expect(req.url).toBe(buildUrl('51900000000', req.message));
    expect(decodeURIComponent(req.url.split('text=')[1]!)).toBe(req.message);
  });
  it('propaga greeting/closing', () => {
    const req = buildRequest(emptyCart(), { phone: '1', greeting: 'G', closing: 'C' });
    expect(req.message.startsWith('G')).toBe(true);
    expect(req.message.endsWith('C')).toBe(true);
  });
});

/* ---------- Formulario de contacto ---------- */

const form = (over: Partial<ContactFormData> = {}): ContactFormData => ({
  name: 'Ana Prueba',
  phone: '+51 900 000 000',
  subject: 'Repuestos',
  message: 'Necesito una batería para mi bicimoto.',
  ...over,
});

describe('buildContactMessage', () => {
  it('compone saludo, asunto, teléfono y mensaje en líneas separadas', () => {
    expect(buildContactMessage(form())).toBe(
      ['Hola 👋 Soy Ana Prueba y escribo desde la web.', 'Asunto: Repuestos', 'Teléfono: +51 900 000 000', 'Mensaje: Necesito una batería para mi bicimoto.'].join(
        '\n',
      ),
    );
  });

  it('omite teléfono y mensaje vacíos; nombre vacío → "un cliente"', () => {
    const msg = buildContactMessage(form({ name: '   ', phone: '', message: '' }));
    expect(msg).toBe('Hola 👋 Soy un cliente y escribo desde la web.\nAsunto: Repuestos');
    expect(msg).not.toContain('Teléfono');
    expect(msg).not.toContain('Mensaje');
  });

  it('sanea nombre y teléfono: quita control chars, colapsa espacios y recorta a 80/24', () => {
    const msg = buildContactMessage(form({ name: '  Ana\u0000   Pérez\n', phone: '\u0007+51  999   111' }));
    expect(msg).toContain('Soy Ana Pérez y escribo');
    expect(msg).toContain('Teléfono: +51 999 111');
    const long = buildContactMessage(form({ name: 'n'.repeat(200), phone: '9'.repeat(60) }));
    expect(long.match(/Soy (n+) y/)![1]).toHaveLength(80);
    expect(long.match(/Teléfono: (9+)/)![1]).toHaveLength(24);
  });

  it('sanea el mensaje como las notas: sin saltos de línea y máximo 500', () => {
    const msg = buildContactMessage(form({ message: 'línea 1\n\nlínea 2\r\n' + 'x'.repeat(600) }));
    const body = msg.split('\n').find((l) => l.startsWith('Mensaje: '))!;
    expect(body).toContain('línea 1 línea 2');
    expect(body.slice('Mensaje: '.length)).toHaveLength(500);
    // Un salto de línea inyectado en el mensaje no crea una línea nueva en el texto
    expect(msg.split('\n')).toHaveLength(4);
  });

  it('un asunto desconocido cae en "Otro" (datos no confiables del DOM)', () => {
    expect(buildContactMessage(form({ subject: 'Hack' as ContactFormData['subject'] }))).toContain('Asunto: Otro');
    for (const s of CONTACT_SUBJECTS) expect(buildContactMessage(form({ subject: s }))).toContain(`Asunto: ${s}`);
    expect(CONTACT_SUBJECTS).toEqual(['Compra', 'Servicio técnico', 'Repuestos', 'Otro']);
  });

  it('genera un enlace de WhatsApp válido con el mensaje codificado y decodificable', () => {
    const msg = buildContactMessage(form({ message: 'Hola & adiós, ¿precio?' }));
    const url = buildUrl('51900000000', msg);
    expect(url.startsWith('https://api.whatsapp.com/send?phone=51900000000&text=')).toBe(true);
    expect(url).not.toContain(' ');
    expect(url).not.toContain('\n');
    expect(url).toContain('Ana%20Prueba');
    expect(url).toContain('%26');
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe(msg);
  });
});

describe('buildMailto y SUPPORT_MESSAGE', () => {
  it('mailto con asunto y cuerpo codificados', () => {
    const href = buildMailto('ventas@example.test', '[Web] Compra — Ana', 'línea 1\nlínea 2 & fin');
    expect(href).toBe('mailto:ventas@example.test?subject=%5BWeb%5D%20Compra%20%E2%80%94%20Ana&body=l%C3%ADnea%201%0Al%C3%ADnea%202%20%26%20fin');
    const u = new URL(href);
    expect(u.protocol).toBe('mailto:');
    expect(u.searchParams.get('body')).toBe('línea 1\nlínea 2 & fin');
  });
  it('mensaje de soporte con huecos para modelo y problema', () => {
    expect(SUPPORT_MESSAGE).toContain('RAIDEN');
    expect(SUPPORT_MESSAGE).toMatch(/Modelo: ___/);
    expect(SUPPORT_MESSAGE).toMatch(/Problema: ___/);
  });
});
