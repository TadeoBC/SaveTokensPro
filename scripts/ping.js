#!/usr/bin/env node
// Lo corre launchd cada 5 min. Si la ventana de 5 h ya venció y estamos en horario,
// manda un mensaje mínimo para abrir la siguiente justo a tiempo y que no se corra el horario.
const fs = require('fs');
const { spawnSync } = require('child_process');
const { RUTA, expandir, leerJson, escribirJson, config, minutosDelDia, hora } = require('./lib');

const CINCO_H = 5 * 3600 * 1000;
const forzar = process.argv.includes('--forzar');
const simular = process.argv.includes('--simular');

function log(msg) {
  const linea = `${new Date().toISOString()} ${msg}\n`;
  try { fs.appendFileSync(RUTA.pingLog, linea); } catch {}
  if (process.stdout.isTTY || simular) process.stdout.write(linea);
}

const cfg = config();
if (!cfg.ping?.activo && !forzar) process.exit(0);

const ahora = new Date();
const min = ahora.getHours() * 60 + ahora.getMinutes();
const inicio = minutosDelDia(cfg.horario?.inicio || '05:00');
const fin = minutosDelDia(cfg.horario?.fin || '20:00');
// Último arranque permitido: la ventana que abra debe cerrar a más tardar a la hora de fin (+15 min de tolerancia).
const ultimoArranque = fin - 300 + 15;
const enHorario = min >= inicio && min <= ultimoArranque;

const estado = leerJson(RUTA.estado, {});
const pingEstado = leerJson(RUTA.ping, {});
const finPorStatusline = estado.five_hour?.resets_at ? estado.five_hour.resets_at * 1000 : 0;
const finPorPing = pingEstado.ultimo ? pingEstado.ultimo + CINCO_H : 0;
// Gana la fuente más reciente: un ping que cayó dentro de una ventana ya abierta no la alarga.
const finVentana = (estado.actualizado || 0) > (pingEstado.ultimo || 0) ? finPorStatusline : finPorPing;
const vencida = Date.now() >= finVentana;

if (!forzar && !(enHorario && vencida)) {
  if (simular) log(`sin ping (enHorario=${enHorario}, ventana termina ${finVentana ? hora(finVentana) : 'desconocido'})`);
  process.exit(0);
}

if (simular) { log('haría ping ahora'); process.exit(0); }

const claude = expandir(process.env.CLAUDE_BIN || cfg.ping?.claudeBin || '~/.local/bin/claude');
const r = spawnSync(claude, ['-p', 'Responde solo: ok', '--model', cfg.ping?.modelo || 'haiku'], {
  cwd: RUTA.dir,
  encoding: 'utf8',
  timeout: 120000,
  env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/bin:/bin` },
});

if (r.status === 0) {
  escribirJson(RUTA.ping, { ultimo: Date.now() });
  log(`ping ok → ventana hasta ~${hora(Date.now() + CINCO_H)} (${(r.stdout || '').trim().slice(0, 40)})`);
} else {
  log(`ping FALLÓ status=${r.status} ${(r.stderr || r.error?.message || '').trim().slice(0, 300)}`);
  process.exit(1);
}
