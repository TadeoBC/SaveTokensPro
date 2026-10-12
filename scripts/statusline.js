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
  const estado = {
    actualizado: Date.now(),
    persona: cfg.persona || null,
    five_hour: rl.five_hour || previo.five_hour || null,
    seven_day: rl.seven_day || previo.seven_day || null,
    modelo: entrada.model?.display_name || null,
  };
  try { escribirJson(RUTA.estado, estado); } catch {}
  // Historial: una línea cuando cambia algún porcentaje entero.
  const firma = `${Math.floor(estado.five_hour?.used_percentage ?? -1)}|${Math.floor(estado.seven_day?.used_percentage ?? -1)}`;
  if (firma !== previo.firma) {
    try {
      fs.appendFileSync(RUTA.historial, JSON.stringify({ t: estado.actualizado, persona: estado.persona, modelo: estado.modelo,
        h5: estado.five_hour?.used_percentage ?? null, sem: estado.seven_day?.used_percentage ?? null }) + '\n');
      escribirJson(RUTA.estado, { ...estado, firma });
    } catch {}
  } else {
    try { escribirJson(RUTA.estado, { ...estado, firma }); } catch {}
  }
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
