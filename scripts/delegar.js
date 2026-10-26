#!/usr/bin/env node
// Control multiagente: manda un encargo (un .md autocontenido) a otra sesión
// —otra cuenta de Claude Code, Codex CLI…— en segundo plano, y lleva la cuenta
// de cuáles siguen corriendo, cuáles terminaron y cuáles se cortaron por límite.
//
//   node delegar.js lanzar <perfil> <encargo.md> [--nombre x] [--cwd dir]
//   node delegar.js estado [nombre]
//   node delegar.js detener <nombre>
//   node delegar.js perfiles
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { RUTA, expandir, leerJson, escribirJson, config, duracion } = require('./lib');

// Lo que escriben los CLIs cuando se quedan sin cuota o sin sesión: el proceso
// sale con 0 o 1 sin haber hecho el trabajo, así que hay que leerlo en el log.
const CORTES = [
  [/session limit|usage limit|hit your .*limit|rate.?limit|429/i, 'límite de uso'],
  [/not logged in|please run \/login|unauthorized|401/i, 'sin sesión iniciada'],
];

const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};

function perfiles() {
  return config().delegar?.perfiles || {};
}

function metaRuta(nombre) {
  return path.join(RUTA.encargos, `${nombre}.json`);
}

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function comando(perfil, encargo, salida) {
  const bin = expandir(perfil.bin || (perfil.tipo === 'codex' ? 'codex' : 'claude'));
  if (perfil.tipo === 'codex') {
    const a = ['exec', '-s', perfil.sandbox || 'read-only', '-o', salida];
    if (perfil.modelo) a.push('-m', perfil.modelo);
    if (perfil.esfuerzo) a.push('-c', `model_reasoning_effort=${perfil.esfuerzo}`);
    return [bin, [...a, encargo]];
  }
  const a = ['-p', encargo, '--output-format', 'text'];
  if (perfil.permisos) a.push('--permission-mode', perfil.permisos);
  if (perfil.herramientas) a.push('--allowedTools', perfil.herramientas);
  if (perfil.modelo) a.push('--model', perfil.modelo);
  return [bin, a];
}

function lanzar() {
  const nombreOpt = opcion('nombre');
  const cwd = path.resolve(expandir(opcion('cwd') || process.cwd()));
  const [, perfilNombre, archivo] = args;
  const perfil = perfiles()[perfilNombre];
  if (!perfil) return fallar(`No existe el perfil "${perfilNombre}". Mira: node delegar.js perfiles`);
  if (!archivo || !fs.existsSync(archivo)) return fallar('Falta el archivo del encargo (.md).');
  const nombre = nombreOpt || `${path.basename(archivo, '.md')}-${Date.now().toString(36)}`;
  fs.mkdirSync(RUTA.encargos, { recursive: true });
  const log = path.join(RUTA.encargos, `${nombre}.log`);
  const salida = path.join(RUTA.encargos, `${nombre}.salida.md`);
  const [bin, a] = comando(perfil, fs.readFileSync(archivo, 'utf8'), salida);
  const fd = fs.openSync(log, 'a');
  const hijo = spawn(bin, a, { cwd, detached: true, stdio: ['ignore', fd, fd] });
  hijo.on('error', (e) => fallar(`No se pudo lanzar ${bin}: ${e.message}`));
  hijo.unref();
  escribirJson(metaRuta(nombre), {
    nombre, perfil: perfilNombre, pid: hijo.pid, inicio: Date.now(), cwd,
    encargo: path.resolve(archivo), log, salida: perfil.tipo === 'codex' ? salida : log,
  });
  console.log(`Lanzado "${nombre}" con ${perfilNombre} (pid ${hijo.pid}). Log: ${log}`);
}

function diagnostico(meta) {
  let cola = '';
  try {
    const texto = fs.readFileSync(meta.log, 'utf8');
    cola = texto.slice(-4000);
  } catch {}
  if (vivo(meta.pid)) return { estado: 'corriendo', cola };
  for (const [re, motivo] of CORTES) if (re.test(cola)) return { estado: `cortado: ${motivo}`, cola };
  return { estado: 'terminó', cola };
}

function estado() {
  const [, nombre] = args;
  if (!fs.existsSync(RUTA.encargos)) return console.log('No hay encargos todavía.');
  const metas = fs.readdirSync(RUTA.encargos)
    .filter((f) => f.endsWith('.json'))
    .map((f) => leerJson(path.join(RUTA.encargos, f), null))
    .filter((m) => m && (!nombre || m.nombre === nombre))
    .sort((a, b) => b.inicio - a.inicio);
  if (!metas.length) return console.log(nombre ? `No hay encargo "${nombre}".` : 'No hay encargos todavía.');
  for (const m of metas) {
    const d = diagnostico(m);
    console.log(`${m.nombre}  [${m.perfil}]  ${d.estado}  · hace ${duracion(Date.now() - m.inicio)}`);
    if (nombre) {
      console.log(`  log: ${m.log}\n  salida: ${m.salida}\n---\n${d.cola.split('\n').slice(-25).join('\n')}`);
    }
  }
}

function detener() {
  const [, nombre] = args;
  const meta = leerJson(metaRuta(nombre || ''), null);
  if (!meta) return fallar(`No hay encargo "${nombre}".`);
  if (!vivo(meta.pid)) return console.log(`"${nombre}" ya no corre.`);
  try { process.kill(-meta.pid, 'SIGTERM'); } catch { process.kill(meta.pid, 'SIGTERM'); }
  console.log(`Detenido "${nombre}". Ojo: pudo dejar archivos a medias; revisa con git diff.`);
}

function fallar(msg) {
  console.error(msg);
  process.exit(1);
}

const acciones = {
  lanzar,
  estado,
  detener,
  perfiles: () => console.log(JSON.stringify(perfiles(), null, 2)),
};
(acciones[args[0]] || (() => fallar('Uso: delegar.js lanzar|estado|detener|perfiles …')))();
