#!/usr/bin/env node
// Status line de Claude Code: ventana de 5 h, semana con semáforo de ritmo y aviso de relleno.
// Además guarda la última lectura en estado.json para que el ping y la skill /consumo la usen.
const fs = require('fs');
const { RUTA, leerJson, escribirJson, config, hora, duracion, ritmoSemanal, sugerirRelleno } = require('./lib');

const C = { gris: '\x1b[90m', verde: '\x1b[32m', amarillo: '\x1b[33m', rojo: '\x1b[31m', cian: '\x1b[36m', neg: '\x1b[1m', fin: '\x1b[0m' };

function barra(pct, ancho = 10) {
  const llenos = Math.round((Math.min(100, Math.max(0, pct)) / 100) * ancho);
  return '▓'.repeat(llenos) + '░'.repeat(ancho - llenos);
}

function guardar(entrada, cfg) {
  const rl = entrada.rate_limits;
  if (!rl || (!rl.five_hour && !rl.seven_day)) return;
  const previo = leerJson(RUTA.estado, {});
  const ahora = Date.now();

  // Gasto propio: el costo acumulado de CADA sesión de esta persona. Si sube,
  // esta persona acaba de recibir una respuesta. Sirve para separar su consumo
  // del de quien comparta la cuenta desde otro lado (Desktop, web).
  const sesiones = { ...(previo.sesiones || {}) };
  let propio = Number(previo.propio || 0);
  const sid = entrada.session_id;
  const costo = Number(entrada.cost?.total_cost_usd);
  if (sid && Number.isFinite(costo)) {
    const antes = sesiones[sid]?.costo;
    // Una sesión nueva (o un /clear, que reinicia el costo) cuenta desde cero.
    const delta = antes === undefined || costo < antes ? costo : costo - antes;
    propio += Math.max(0, delta);
    sesiones[sid] = { costo, visto: ahora };
  }
  // Sólo se guardan las sesiones de los últimos 2 días.
  for (const k of Object.keys(sesiones)) if (ahora - sesiones[k].visto > 2 * 86400000) delete sesiones[k];
  const respondio = propio > Number(previo.propio || 0) + 1e-9;

  const estado = {
    actualizado: ahora,
    persona: cfg.persona || null,
    five_hour: rl.five_hour || previo.five_hour || null,
    seven_day: rl.seven_day || previo.seven_day || null,
    modelo: entrada.model?.display_name || null,
    propio: Number(propio.toFixed(6)),
    sesiones,
    ultimaActividad: respondio ? ahora : previo.ultimaActividad || null,
  };
  // Historial: una línea cuando cambia el porcentaje, y también cuando esta
  // persona trabaja (como mucho una cada 2 min) para saber cuándo estuvo activa.
  const firma = `${Math.floor(estado.five_hour?.used_percentage ?? -1)}|${Math.floor(estado.seven_day?.used_percentage ?? -1)}`;
  const latido = respondio && ahora - (previo.ultimaLinea || 0) > 120000;
  let ultimaLinea = previo.ultimaLinea || 0;
  if (firma !== previo.firma || latido) {
    try {
      fs.appendFileSync(RUTA.historial, JSON.stringify({ t: ahora, persona: estado.persona, modelo: estado.modelo,
        h5: estado.five_hour?.used_percentage ?? null, sem: estado.seven_day?.used_percentage ?? null,
        h5Reinicia: estado.five_hour?.resets_at ?? null, semReinicia: estado.seven_day?.resets_at ?? null,
        propio: estado.propio }) + '\n');
      ultimaLinea = ahora;
    } catch {}
  }
  try { escribirJson(RUTA.estado, { ...estado, firma, ultimaLinea }); } catch {}
}

let crudo = '';
process.stdin.on('data', (d) => (crudo += d));
process.stdin.on('end', () => {
  let entrada = {};
  try { entrada = JSON.parse(crudo); } catch {}
  const cfg = config();
  guardar(entrada, cfg);

  const ahora = Date.now();
  const partes = [];
  const cincoH = entrada.rate_limits?.five_hour;
  const semana = entrada.rate_limits?.seven_day;
  const ritmo = ritmoSemanal(semana, cfg, ahora);

  if (cincoH?.used_percentage != null) {
    const p = cincoH.used_percentage;
    const col = p >= 90 ? C.rojo : p >= 70 ? C.amarillo : C.verde;
    const fin = cincoH.resets_at * 1000;
    partes.push(`5h ${col}${barra(p)} ${Math.round(p)}%${C.fin} ${C.gris}↻ ${hora(fin)} (${duracion(fin - ahora)})${C.fin}`);
  } else {
    partes.push(`${C.gris}5h —${C.fin}`);
  }

  if (ritmo) {
    const col = C[ritmo.color];
    const punto = { verde: '●', amarillo: '●', rojo: '●' }[ritmo.color];
    partes.push(`sem ${col}${punto} ${Math.round(ritmo.usado)}%${C.fin}${C.gris}/ritmo ${Math.round(ritmo.esperado)}%${C.fin}`);
  }

  const modelo = entrada.model?.display_name;
  const ctx = entrada.context_window?.used_percentage;
  if (modelo) partes.push(`${C.cian}${modelo}${C.fin}${ctx != null ? C.gris + ' ctx ' + Math.round(ctx) + '%' + C.fin : ''}`);

  let linea = partes.join(` ${C.gris}│${C.fin} `);
  const relleno = sugerirRelleno(cincoH, ritmo, cfg, ahora);
  if (relleno) {
    linea += relleno.bloqueado
      ? `\n${C.amarillo}⚠ Queda ${Math.round(relleno.restante)}% de la ventana, pero la semana va en rojo: no rellenes.${C.fin}`
      : `\n${C.neg}${C.amarillo}⚡ Queda ${Math.round(relleno.restante)}% y ${duracion(relleno.falta)} para el reinicio: lanza relleno (/consumo relleno)${C.fin}`;
  }
  process.stdout.write(linea + '\n');
});
