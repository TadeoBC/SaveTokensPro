// Utilidades compartidas: config, estado y cálculo del semáforo.
const fs = require('fs');
const path = require('path');

// Los datos viven en la raíz de la instalación (un nivel arriba de scripts/),
// o donde diga SAVETOKENS_HOME.
const DIR = process.env.SAVETOKENS_HOME || path.join(__dirname, '..');
const RUTA = {
  dir: DIR,
  encargos: path.join(DIR, 'encargos'),
  config: path.join(DIR, 'config.json'),
  estado: path.join(DIR, 'estado.json'),
  historial: path.join(DIR, 'historial.jsonl'),
  ping: path.join(DIR, 'ping-estado.json'),
  pingLog: path.join(DIR, 'ping.log'),
};

const expandir = (ruta) => String(ruta || '').replace(/^~(?=$|\/)/, process.env.HOME || '');

function leerJson(ruta, defecto) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return defecto; }
}

function escribirJson(ruta, datos) {
  const tmp = ruta + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2));
  fs.renameSync(tmp, ruta);
}

const config = () => leerJson(RUTA.config, {});

function minutosDelDia(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

function hora(epochMs) {
  return new Date(epochMs).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function duracion(ms) {
  if (ms <= 0) return '0m';
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, '0')}m` : `${min}m`;
}

// Ritmo semanal: el % que "debería" llevar según el tiempo transcurrido de la semana.
function ritmoSemanal(semana, cfg, ahora = Date.now()) {
  if (!semana || semana.used_percentage == null || !semana.resets_at) return null;
  const fin = semana.resets_at * 1000;
  const inicio = fin - 7 * 24 * 3600 * 1000;
  const esperado = Math.min(100, Math.max(0, ((ahora - inicio) / (fin - inicio)) * 100));
  const usado = semana.used_percentage;
  const delta = usado - esperado;
  const amarillo = cfg?.semaforo?.amarilloHasta ?? 10;
  const color = delta <= 0 ? 'verde' : delta <= amarillo ? 'amarillo' : 'rojo';
  return { usado, esperado, delta, color, reinicia: fin };
}

// ¿Conviene lanzar trabajo de relleno antes de que se pierda la ventana de 5 h?
function sugerirRelleno(cincoH, ritmo, cfg, ahora = Date.now()) {
  if (!cincoH || cincoH.used_percentage == null || !cincoH.resets_at) return null;
  const falta = cincoH.resets_at * 1000 - ahora;
  const restante = 100 - cincoH.used_percentage;
  const r = cfg?.relleno || {};
  if (falta <= 0 || falta > (r.minutosAntes ?? 30) * 60000) return null;
  if (restante < (r.minRestantePct ?? 40) * (falta / ((r.minutosAntes ?? 30) * 60000))) return null;
  if (ritmo && ritmo.color === 'rojo') return { restante, falta, bloqueado: true };
  return { restante, falta, bloqueado: false };
}

module.exports = { RUTA, expandir, leerJson, escribirJson, config, minutosDelDia, hora, duracion, ritmoSemanal, sugerirRelleno };
