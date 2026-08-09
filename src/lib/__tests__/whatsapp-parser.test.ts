import { describe, expect, it } from 'vitest';
import {
  classifyMessage,
  extractOTNumber,
  parseWhatsAppEvents,
  parseWhatsAppMessage,
} from '../whatsapp-parser';

describe('classifyMessage', () => {
  it('classifies the classic start forms', () => {
    expect(classifyMessage('inicio ot 1234')).toBe('start');
    expect(classifyMessage('empiezo la 1234')).toBe('start');
  });

  it("classifies the plant's real start phrasing (entro/sigo/retomo)", () => {
    expect(classifyMessage('entro ot 40965')).toBe('start');
    expect(classifyMessage('entra la 40965 a maquina')).toBe('start');
    expect(classifyMessage('sigo con la 40965')).toBe('start');
    expect(classifyMessage('retomo ot 40965')).toBe('start');
    expect(classifyMessage('paso a la 40965')).toBe('start');
  });

  it('does not false-match keywords inside other words', () => {
    // 'centro' contains 'entro'; 'finde' contains 'fin'
    expect(classifyMessage('voy al centro con la 4500')).not.toBe('start');
    expect(classifyMessage('el finde trabajamos la 4500')).not.toBe('end');
  });

  it('classifies end and cancel', () => {
    expect(classifyMessage('fin 1234 hice 500 pliegos')).toBe('end');
    expect(classifyMessage('cancelar ot 555')).toBe('cancel');
  });
});

describe('parseWhatsAppMessage (single)', () => {
  it('parses a full end report', () => {
    const r = parseWhatsAppMessage('fin 1234 hice 500 pliegos 3 de merma doblado listo');
    expect(r.message_type).toBe('end');
    expect(r.ot_number).toBe('1234');
    expect(r.production_data?.pliegos_produced).toBe(500);
    expect(r.production_data?.merma).toBe(3);
  });

  it('parses Chilean thousands separators', () => {
    const r = parseWhatsAppMessage('fin ot 40879 7.600 pliegos');
    expect(r.production_data?.pliegos_produced).toBe(7600);
  });
});

describe('parseWhatsAppEvents (compound)', () => {
  it('splits the founding example into END + START', () => {
    const events = parseWhatsAppEvents('Fin OT 40879, 7600 pliegos, entro OT 40965');
    expect(events).toHaveLength(2);
    expect(events[0].message_type).toBe('end');
    expect(events[0].ot_number).toBe('40879');
    expect(events[0].production_data?.pliegos_produced).toBe(7600);
    expect(events[1].message_type).toBe('start');
    expect(events[1].ot_number).toBe('40965');
  });

  it('handles informal compound phrasing', () => {
    const events = parseWhatsAppEvents('listo la 40879, 7600 buenos, sigo con la 40965');
    expect(events).toHaveLength(2);
    expect(events[0].message_type).toBe('end');
    expect(events[0].ot_number).toBe('40879');
    expect(events[1].message_type).toBe('start');
    expect(events[1].ot_number).toBe('40965');
  });

  it('keeps simple messages as a single event', () => {
    const events = parseWhatsAppEvents('fin 1234 hice 500 pliegos 3 de merma doblado listo');
    expect(events).toHaveLength(1);
    expect(events[0].message_type).toBe('end');
    expect(events[0].ot_number).toBe('1234');
  });

  it('keeps a lone start as a single event', () => {
    const events = parseWhatsAppEvents('entro ot 40965');
    expect(events).toHaveLength(1);
    expect(events[0].message_type).toBe('start');
    expect(events[0].ot_number).toBe('40965');
  });

  it('collapses the same action repeated for the same OT', () => {
    const events = parseWhatsAppEvents('fin ot 100 quedo listo ot 100');
    expect(events).toHaveLength(1);
    expect(events[0].message_type).toBe('end');
    expect(events[0].ot_number).toBe('100');
  });

  it('cancel messages pass through unchanged', () => {
    const events = parseWhatsAppEvents('cancelar ot 555 me equivoque');
    expect(events).toHaveLength(1);
    expect(events[0].message_type).toBe('cancel');
    expect(events[0].ot_number).toBe('555');
  });
});

describe('extractOTNumber', () => {
  it('reads all common formats', () => {
    expect(extractOTNumber('OT-40879')).toBe('40879');
    expect(extractOTNumber('ot 40879')).toBe('40879');
    expect(extractOTNumber('#40879')).toBe('40879');
    expect(extractOTNumber('la 40879')).toBe('40879');
  });
});

describe('papel perdido — mensajes reales del taller', () => {
  it('«8000 pliegos fallados» es merma, NO producción', () => {
    // El defecto: el patrón de pliegos ganaba y ocho mil pliegos arruinados
    // entraban como producción. Mensaje real de la bandeja de capturas.
    const r = parseWhatsAppMessage('45500, 5 horas, 8000 pliegos fallados');
    expect(r.production_data?.merma).toBe(8000);
    expect(r.production_data?.pliegos_produced).toBeNull();
  });

  it('sigue leyendo la merma nombrada de la forma canónica', () => {
    const r = parseWhatsAppMessage('Fin 40502, 62.000 pliegos, 900 de merma, offset 4 colores ok');
    expect(r.production_data?.pliegos_produced).toBe(62000);
    expect(r.production_data?.merma).toBe(900);
    // `buenos` sólo se llena si el mensaje lo dice; el parser no lo deriva de
    // pliegos − merma. Derivarlo sería otra decisión, no parte de este arreglo.
    expect(r.production_data?.buenos).toBeNull();
  });

  it('reconoce las otras palabras con que se nombra lo perdido', () => {
    for (const [texto, esperado] of [
      ['fin 1234, 200 pliegos malogrados', 200],
      ['fin 1234, 150 hojas perdidas', 150],
      ['fin 1234, 90 de desperdicio', 90],
      ['fin 1234, 45 pliegos desechados', 45],
    ] as const) {
      expect(parseWhatsAppMessage(texto).production_data?.merma, texto).toBe(esperado);
    }
  });

  it('un tiraje limpio no inventa merma', () => {
    const r = parseWhatsAppMessage('fin ot 40879 7.600 pliegos');
    expect(r.production_data?.pliegos_produced).toBe(7600);
    expect(r.production_data?.merma).toBeNull();
  });

  it('producción y pérdida en el mismo mensaje no se confunden', () => {
    const r = parseWhatsAppMessage('fin 40500, 12.000 pliegos, 340 fallados');
    expect(r.production_data?.pliegos_produced).toBe(12000);
    expect(r.production_data?.merma).toBe(340);
  });
});
