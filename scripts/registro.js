#!/usr/bin/env node
// Registros para el tablero compartido.
//
//   node registro.js <categoría> [nota…]   un registro manual con la última lectura
//   node registro.js sync [categoría]      reparte lo consumido desde la última
//                                          sincronización entre esta persona y
//                                          config.compartir.otraPersona
//   node registro.js confirmar             marca como subido lo que dio `sync`
//
// Reparto de `sync`: el % semanal de la cuenta sólo se actualiza cuando ESTA
// persona recibe una respuesta. Si entre dos lecturas pasaron más de
// `compartir.huecoMin` minutos sin actividad suya, lo que subió en ese hueco
// lo gastó la otra persona; si no, se le cuenta a ésta (aunque la otra haya
// usado en paralelo: es una aproximación).
const fs = require('fs');
const path = require('path');
const { RUTA, leerJson, escribirJson, config } = require('./lib');

const cfg = config();
const [modo, ...resto] = process.argv.slice(2);
const SYNC = path.join(RUTA.dir, 'sync.json');
const PENDIENTE = path.join(RUTA.dir, 'sync-pendiente.json');
const DIR_SALIDA = path.join(RUTA.dir, 'sync');

const ms = (s) => (s ? Number(s) * 1000 : null);

function leerHistorial() {
  try {
    return fs.readFileSync(RUTA.historial, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((l) => l && typeof l.t === 'number' && l.sem != null)
      .sort((a, b) => a.t - b.t);
  } catch { return []; }
}

function registroManual() {
  const categoria = modo || 'programación';
  const e = leerJson(RUTA.estado, null);
  if (!e || !e.seven_day) {
    console.error('Sin lectura todavía: abre Claude Code y manda un mensaje para que la status line la tome.');
    process.exit(1);
  }
  const r = {
    t: Date.now(),
    persona: cfg.persona || 'Sin nombre',
    categoria,
    sem: Math.round(e.seven_day.used_percentage),
    h5: e.five_hour ? Math.round(e.five_hour.used_percentage) : null,
    semReinicia: ms(e.seven_day.resets_at),
    h5Reinicia: e.five_hour ? ms(e.five_hour.resets_at) : null,
    modelo: e.modelo || '',
    nota: resto.join(' ').slice(0, 140),
    fuente: 'claude-code',
  };
  const salida = path.join(RUTA.dir, 'ultimo-registro.json');
  fs.writeFileSync(salida, JSON.stringify(r, null, 2));
  console.log(JSON.stringify({ archivo: salida, doc_id: String(r.t), tablero: cfg.tablero, registro: r }, null, 2));
}

function sync() {
  const yo = cfg.persona || 'Sin nombre';
  const otra = cfg.compartir?.otraPersona || '';
  const hueco = (cfg.compartir?.huecoMin ?? 15) * 60000;
  const categoriaPropia = resto[0] || 'programación';
  const estado = leerJson(RUTA.estado, {});
  const marca = leerJson(SYNC, {});
  const base = marca.ultimo || null;
  const nuevas = leerHistorial().filter((l) => l.t > (base?.t ?? 0));
  if (!nuevas.length) {
    console.log(JSON.stringify({ registros: [], mensaje: 'Nada nuevo desde la última sincronización.' }));
    return;
  }

  // Tramos: los de esta persona se juntan; cada hueco es un tramo de la otra.
  const tramos = [];
  let previa = base;
  for (const l of nuevas) {
    let delta = 0;
    let quien = yo;
    if (previa) {
      const nuevaSemana = l.sem < previa.sem - 0.5;
      delta = nuevaSemana ? l.sem : l.sem - previa.sem;
      if (otra && l.t - previa.t > hueco) quien = otra;
    }
    const actual = tramos[tramos.length - 1];
    if (actual && actual.persona === yo && quien === yo) {
      actual.delta += delta;
      actual.fin = l;
    } else {
      tramos.push({ persona: quien, delta, fin: l });
    }
    previa = l;
  }

  const semReiniciaRespaldo = ms(estado.seven_day?.resets_at);
  fs.mkdirSync(DIR_SALIDA, { recursive: true });
  for (const f of fs.readdirSync(DIR_SALIDA)) fs.unlinkSync(path.join(DIR_SALIDA, f));
  const registros = tramos
    .filter((s) => s.delta > 0.01)
    .map((s) => {
      const mia = s.persona === yo;
      const r = {
        // El tramo de la otra persona termina justo antes de que ésta volviera.
        t: mia ? s.fin.t : s.fin.t - 1,
        persona: s.persona,
        categoria: mia ? categoriaPropia : 'sin categoría',
        sem: Math.round(s.fin.sem * 10) / 10,
        h5: s.fin.h5 != null ? Math.round(s.fin.h5) : null,
        semReinicia: ms(s.fin.semReinicia) || semReiniciaRespaldo,
        h5Reinicia: ms(s.fin.h5Reinicia),
        modelo: mia ? s.fin.modelo || '' : '',
        nota: mia ? 'automático (Claude Code)' : `automático: consumo fuera de la sesión de ${yo}`,
        fuente: 'auto',
      };
      const doc_id = `${r.t}-${r.persona.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '')}`;
      const archivo = path.join(DIR_SALIDA, `${doc_id}.json`);
      fs.writeFileSync(archivo, JSON.stringify(r, null, 2));
      return { doc_id, archivo, persona: r.persona, delta: Math.round(s.delta * 10) / 10, sem: r.sem };
    });
  escribirJson(PENDIENTE, { ultimo: nuevas[nuevas.length - 1] });
  console.log(JSON.stringify({ tablero: cfg.tablero, registros }, null, 2));
}

function confirmar() {
  const p = leerJson(PENDIENTE, null);
  if (!p) return console.log('No hay sincronización pendiente.');
  escribirJson(SYNC, { ultimo: p.ultimo, en: Date.now() });
  fs.unlinkSync(PENDIENTE);
  console.log('Sincronización confirmada.');
}

if (modo === 'sync') sync();
else if (modo === 'confirmar') confirmar();
else registroManual();
