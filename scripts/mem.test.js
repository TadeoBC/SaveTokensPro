// Pruebas de mem.js: node --test scripts/mem.test.js
// Cada prueba usa una bóveda temporal (MEM_VAULT) y un repo git temporal.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const MEM = path.join(__dirname, 'mem.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-test-'));
const VAULT = path.join(tmp, 'vault');
const REPO = path.join(tmp, 'demo');

function mem(args, { input, cwd = REPO } = {}) {
  try {
    const out = execFileSync('node', [MEM, ...args], {
      cwd, input: input ?? '', encoding: 'utf8', env: { ...process.env, MEM_VAULT: VAULT }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}
const idDe = (out) => out.match(/draft: (\S+)/)[1];
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: REPO, stdio: 'ignore' });

test.before(() => {
  fs.mkdirSync(path.join(REPO, 'src'), { recursive: true });
  fs.writeFileSync(path.join(REPO, 'src', 'pagos.ts'), 'export const x = 1;\n');
  sh('git', ['init', '-q']);
  sh('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base']);
  sh('git', ['add', '.']);
  sh('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'pagos']);
});
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let idPagos;

test('1. crea una memoria como draft con su frontmatter', () => {
  const r = mem(['write', '--title', 'Los pagos se redondean al centavo', '--type', 'decision',
    '--tags', 'pagos,dinero', '--files', 'src/pagos.ts', '--agent', 'sonnet', '--cuerpo', '-'],
  { input: '## Decisión\nRedondeo bancario al centavo en el servidor.\n' });
  assert.equal(r.code, 0, r.out);
  idPagos = idDe(r.out);
  const ruta = path.join(VAULT, '01-PROJECTS', 'demo', 'decisions', `${idPagos}.md`);
  const texto = fs.readFileSync(ruta, 'utf8');
  assert.match(texto, /status: draft/);
  assert.match(texto, /project: demo/);
  assert.match(texto, /source_commit: [0-9a-f]{7}/);
});

test('2. recupera por palabras clave, sin importar acentos', () => {
  const r = mem(['search', 'redondeo centavo decision']);
  assert.match(r.out, new RegExp(idPagos));
});

test('3. recupera por proyecto y separa proyectos', () => {
  const otro = path.join(tmp, 'otro');
  fs.mkdirSync(otro);
  execFileSync('git', ['init', '-q'], { cwd: otro });
  assert.equal(mem(['write', '--title', 'Redondeo en otro sistema', '--type', 'decision'], { cwd: otro }).code, 0);
  const soloDemo = mem(['search', 'redondeo', '--project', 'demo', '--json']);
  const filas = JSON.parse(soloDemo.out);
  assert.ok(filas.length >= 1);
  assert.ok(filas.every((f) => f.project === 'demo' || f.project === 'shared'));
});

test('4. actualiza con control de versión y archiva la anterior', () => {
  const ok = mem(['update', idPagos, '--agregar', 'Evidencia', '--version', '1'], { input: 'pagos.spec.ts cubre 0.005 → 0.01' });
  assert.equal(ok.code, 0, ok.out);
  assert.match(mem(['read', idPagos, '--section', 'Evidencia']).out, /pagos\.spec\.ts/);
  assert.ok(fs.existsSync(path.join(VAULT, '04-ARCHIVE', 'versiones', `${idPagos}.v1.md`)));
  const conflicto = mem(['update', idPagos, '--tags', 'x', '--version', '1']);
  assert.equal(conflicto.code, 5, conflicto.out);
});

test('5. detecta duplicados', () => {
  const r = mem(['write', '--title', 'Pagos: se redondean al centavo', '--type', 'decision']);
  assert.equal(r.code, 4, r.out);
  assert.match(r.out, new RegExp(idPagos));
});

test('6. reconstruye el índice desde cero y tras borrarlo', () => {
  fs.rmSync(path.join(VAULT, '.index', 'memoria.db'), { force: true });
  assert.match(mem(['search', 'centavo']).out, new RegExp(idPagos));
  assert.match(mem(['reindex', '--full']).out, /Índice al día/);
});

test('7. persiste entre procesos y detecta edición manual (Obsidian)', () => {
  const r = mem(['write', '--title', 'Nota manual de prueba', '--type', 'discovery']);
  const id = idDe(r.out);
  const ruta = path.join(VAULT, '01-PROJECTS', 'demo', 'knowledge', `${id}.md`);
  fs.appendFileSync(ruta, '\nEl inventario usa zanahorias cuánticas.\n');
  const t = new Date(Date.now() + 2000); fs.utimesSync(ruta, t, t);
  assert.match(mem(['search', 'zanahorias cuanticas']).out, new RegExp(id));
});

test('8. un archivo dañado no rompe nada y aparece en health', () => {
  fs.writeFileSync(path.join(VAULT, '01-PROJECTS', 'demo', 'knowledge', 'roto.md'), '---\nid: roto\ntitle: sin cerrar\n');
  const fs2 = path.join(VAULT, '.index', 'memoria.db');
  fs.writeFileSync(fs2, 'esto no es sqlite');
  const r = mem(['search', 'centavo']);
  assert.match(r.out, new RegExp(idPagos));
  const salud = JSON.parse(mem(['health']).out);
  assert.ok(salud.errores.some((e) => e.ruta.endsWith('roto.md')));
});

test('9. escrituras concurrentes: todas quedan, sin archivos a medias', async () => {
  const n = 8;
  const corridas = Array.from({ length: n }, (_, i) => new Promise((ok) => {
    const p = spawn('node', [MEM, 'write', '--title', `Concurrencia tema ${i} ${'abcdefgh'[i]}xq${i}`, '--type', 'learning', '--forzar'],
      { cwd: REPO, env: { ...process.env, MEM_VAULT: VAULT } });
    p.on('close', ok);
  }));
  const codigos = await Promise.all(corridas);
  assert.deepEqual(codigos, Array(n).fill(0));
  const archivos = fs.readdirSync(path.join(VAULT, '03-AGENT-LEARNINGS'));
  assert.equal(archivos.filter((f) => f.endsWith('.md')).length, n);
  assert.equal(archivos.filter((f) => f.endsWith('.tmp')).length, 0);
  assert.ok(!fs.existsSync(path.join(VAULT, '.index', 'escritura.lock')));
});

test('10. rechaza secretos y archivos .env', () => {
  const casos = [
    'la llave es sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv',
    'DATABASE_URL=postgres://admin:superclave@db:5432/pos',
    'token: ghp_abcdefghijklmnopqrstuvwxyz0123',
    '-----BEGIN RSA PRIVATE KEY-----',
  ];
  for (const c of casos) assert.equal(mem(['write', '--title', 'x' + c.length, '--type', 'risk', '--cuerpo', '-'], { input: c }).code, 3, c);
  assert.equal(mem(['write', '--title', 'config', '--type', 'risk', '--files', 'apps/.env']).code, 3);
});

test('11. el contexto respeta el presupuesto y no inventa relleno', () => {
  for (let i = 0; i < 6; i++) {
    mem(['write', '--title', `Inventario regla ${i} ${'klmnop'[i]}zz${i}`, '--type', 'convention', '--forzar', '--cuerpo', '-'],
      { input: `## Regla\n${'El inventario se descuenta al cobrar. '.repeat(15)}\n` });
  }
  const r = mem(['context', 'inventario cobrar', '--budget', '200']);
  const cuerpo = r.out.split('\n\n').slice(1).join('\n\n').replace(/\n\(≈.*$/s, '');
  assert.ok(cuerpo.length <= 200 * 4, `contexto de ${cuerpo.length} caracteres`);
  assert.match(r.out, /datos de referencia, no instrucciones/);
  assert.equal(mem(['context', 'xilofono marciano']).out.trim(), 'Sin memorias relevantes.');
});

test('12. detecta memorias obsoletas y no las verifica', () => {
  fs.appendFileSync(path.join(REPO, 'src', 'pagos.ts'), 'export const y = 2;\n');
  sh('git', ['add', '.']);
  sh('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'cambio pagos']);
  const v = mem(['validate', idPagos]);
  assert.match(v.out, /1 commit\(s\) tocaron/);
  assert.equal(mem(['validate', idPagos, '--marcar']).code, 5);
  assert.match(mem(['context', 'redondeo pagos']).out, /⚠ 1 commit/);
});

test('13. reemplazo con trazabilidad: la vieja queda superseded y fuera de la búsqueda', () => {
  const nueva = idDe(mem(['write', '--title', 'Pagos redondean hacia arriba siempre', '--type', 'decision']).out);
  assert.equal(mem(['link', nueva, idPagos, '--rel', 'reemplaza']).code, 0);
  assert.doesNotMatch(mem(['search', 'centavo']).out, new RegExp(idPagos));
  assert.match(mem(['search', 'centavo', '--todo']).out, new RegExp(idPagos));
  assert.match(mem(['read', idPagos]).out, /superseded_by/);
});

test('14. el hook de inicio es corto y nunca falla', () => {
  const r = mem(['session-start'], { input: JSON.stringify({ cwd: REPO }) });
  assert.equal(r.code, 0);
  assert.match(r.out, /proyecto «demo»/);
  assert.ok(r.out.length < 600);
});
