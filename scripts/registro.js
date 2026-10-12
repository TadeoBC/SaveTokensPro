#!/usr/bin/env node
// Arma un registro para el tablero a partir de la última lectura de la status line.
// Uso: node registro.js [categoria] [nota...]  → imprime la ruta del JSON y el doc_id.
const fs = require('fs');
const path = require('path');
const { RUTA, leerJson, config } = require('./lib');

const [categoria = 'programación', ...nota] = process.argv.slice(2);
const cfg = config();
const e = leerJson(RUTA.estado, null);
if (!e || !e.seven_day) {
  console.error('Sin lectura todavía: abre una sesión de Claude Code y manda un mensaje para que la status line la tome.');
  process.exit(1);
}
const r = {
  t: Date.now(),
  persona: cfg.persona || 'Sin nombre',
  categoria,
  sem: Math.round(e.seven_day.used_percentage),
  h5: e.five_hour ? Math.round(e.five_hour.used_percentage) : null,
  semReinicia: e.seven_day.resets_at * 1000,
  h5Reinicia: e.five_hour ? e.five_hour.resets_at * 1000 : null,
  modelo: e.modelo || '',
  nota: nota.join(' ').slice(0, 140),
  fuente: 'claude-code',
  lecturaDe: e.actualizado,
};
const salida = path.join(RUTA.dir, 'ultimo-registro.json');
fs.writeFileSync(salida, JSON.stringify(r, null, 2));
console.log(JSON.stringify({ archivo: salida, doc_id: String(r.t), tablero: cfg.tablero, registro: r }, null, 2));
