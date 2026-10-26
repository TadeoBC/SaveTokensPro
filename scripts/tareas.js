#!/usr/bin/env node
// Apoyo de /tarea-grande: presupuesto según la cuota y bitácora de resultados.
//
//   node tareas.js presupuesto          modo de gasto según estado.json:
//                                       normal | ahorro | minimo
//   node tareas.js registrar '<json>'   agrega una línea a tareas.jsonl
//   node tareas.js resumen [n]          desempeño por categoría y modelo,
//                                       y las últimas n tareas (5 por defecto)
//
// Línea de registrar (lo que no se sepa, se omite; nunca se inventa):
//   { "tarea": "...", "categoria": "backend", "nivel": 4,
//     "agentes": [{ "rol": "implementador", "modelo": "sonnet", "ok": true,
//                   "reintentos": 0, "tokens": 41000, "min": 6 }],
//     "verificacion": "tsc ok, jest 212/212", "resultado": "ok",
//     "escalo": "motivo, si hubo" }
// Después, si el usuario corrige algo de esa tarea:
//   node tareas.js registrar '{"correccion": "<tarea>", "modelo": "sonnet", "categoria": "backend"}'
const fs = require('fs');
const path = require('path');
const { RUTA, leerJson, config, ritmoSemanal } = require('./lib');

const BITACORA = path.join(RUTA.dir, 'tareas.jsonl');
const [modo, ...resto] = process.argv.slice(2);

function presupuesto() {
  const e = leerJson(RUTA.estado, null);
  if (!e || !e.five_hour) {
    console.log(JSON.stringify({ modo: 'normal', motivo: 'sin lectura de cuota' }));
    return;
  }
  const vieja = !e.actualizado || Date.now() - e.actualizado > 10 * 60000;
  const ventana = e.five_hour.used_percentage;
  const ritmo = ritmoSemanal(e.seven_day, config());
  const semana = ritmo ? ritmo.color : 'desconocido';
  let m = 'normal';
  if (semana === 'rojo' || ventana >= 90) m = 'minimo';
  else if (semana === 'amarillo' || ventana >= 75) m = 'ahorro';
  console.log(JSON.stringify({
    modo: m,
    ventana5h: ventana,
    semana: ritmo ? Math.round(ritmo.usado) : null,
    ritmoEsperado: ritmo ? Math.round(ritmo.esperado) : null,
    semaforo: semana,
    lecturaVieja: vieja,
  }));
}

function registrar() {
  let dato;
  try { dato = JSON.parse(resto.join(' ')); } catch {
    console.error('El registro debe ser JSON válido.');
    process.exit(2);
  }
  fs.appendFileSync(BITACORA, JSON.stringify({ t: Date.now(), ...dato }) + '\n');
  console.log('Registrado en ' + BITACORA);
}

function resumen() {
  const n = Number(resto[0]) || 5;
  let lineas = [];
  try {
    lineas = fs.readFileSync(BITACORA, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { /* sin bitácora todavía */ }
  if (!lineas.length) { console.log('Sin tareas registradas todavía.'); return; }

  // Por categoría y modelo: usos, fallos, reintentos y correcciones posteriores.
  const tabla = {};
  const fila = (cat, mod) => {
    const k = `${cat || 'sin categoría'} · ${mod}`;
    return (tabla[k] ||= { usos: 0, fallos: 0, reintentos: 0, correcciones: 0, tokens: 0 });
  };
  for (const l of lineas) {
    if (l.correccion) { fila(l.categoria, l.modelo || '?').correcciones++; continue; }
    for (const a of l.agentes || []) {
      const f = fila(l.categoria, a.modelo || '?');
      f.usos++;
      if (a.ok === false) f.fallos++;
      f.reintentos += a.reintentos || 0;
      f.tokens += a.tokens || 0;
    }
  }
  console.log('categoría · modelo | usos | fallos | reintentos | correcciones | tokens');
  for (const [k, f] of Object.entries(tabla).sort()) {
    console.log(`${k} | ${f.usos} | ${f.fallos} | ${f.reintentos} | ${f.correcciones} | ${f.tokens || '-'}`);
  }
  console.log(`\nÚltimas ${n}:`);
  for (const l of lineas.filter((x) => !x.correccion).slice(-n)) {
    const fecha = new Date(l.t).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    const modelos = (l.agentes || []).map((a) => `${a.rol}:${a.modelo}`).join(', ') || 'solo';
    console.log(`${fecha} · N${l.nivel ?? '?'} · ${l.resultado ?? '?'} · ${modelos} · ${l.tarea}`);
  }
}

if (modo === 'presupuesto') presupuesto();
else if (modo === 'registrar') registrar();
else if (modo === 'resumen') resumen();
else {
  console.error('Uso: node tareas.js presupuesto | registrar \'<json>\' | resumen [n]');
  process.exit(2);
}
