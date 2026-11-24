/* Reporte de turno Telehandler — PWA sin señal.
 * Todo queda en el aparato (IndexedDB): maestro, registros, fotos y firmas. El repositorio no lleva datos. */
'use strict';
const APP_V = '1.0';

/* ====================== Utilidades ====================== */
const $ = id => document.getElementById(id);
const p2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const aFecha = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const r2 = v => (v === null ? null : Math.round(v * 100) / 100);
const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: 2 }));
const { es, norm } = Maestro;
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fLarga = s => { const d = aFecha(s); return `${p2(d.getDate())}-${MC[d.getMonth()]}-${d.getFullYear()}`; };
const ddmmaaaa = s => { const [y, m, d] = s.split('-'); return `${d}${m}${y}`; };
const esNoche = t => norm(t).startsWith('n');

/** h('div', {class:'x', onclick}, hijos...) — arma el DOM sin plantillas HTML */
function h(tag, at, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(at || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'value') e.value = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(9)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const svg = d => h('span', { html: `<svg viewBox="0 0 24 24">${d}</svg>` }).firstChild;

/** Período operativo (mes de liquidación), por la fecha del turno; se nombra por el mes de cierre.
 *  Regla general: del 26 (turno Día) al 25 del mes siguiente (turno Noche).
 *  Excepciones: diciembre va del 26-nov al 31-dic; enero es corto, del 1 al 25-ene.
 *  Se calcula siempre con esta regla (no con el calendario del maestro), igual que en la BD. */
function limitesPeriodo(y, m) {   // m = mes de cierre (0-11)
  const ini = m === 0 ? new Date(y, 0, 1) : new Date(y, m - 1, 26), fin = m === 11 ? new Date(y, 11, 31) : new Date(y, m, 25);
  return { ini, fin };
}
function periodoDe(y, m) {
  const { ini, fin } = limitesPeriodo(y, m);
  return { codigo: `${y}-${p2(m + 1)}`, nombre: `${MES[m][0].toUpperCase()}${MES[m].slice(1)} ${y}`, ini, fin,
    rango: `${fLarga(iso(ini))} al ${fLarga(iso(fin))}` };
}
function periodo(s) {
  const d = aFecha(s); let y = d.getFullYear(), m = d.getMonth();
  if (m !== 11 && d.getDate() >= 26) m++;   // diciembre cierra el 31: no pasa a enero
  return periodoDe(y, m);
}
const periodoCodigo = c => periodoDe(+c.slice(0, 4), +c.slice(5, 7) - 1);
/** Semana operativa: de domingo (turno Día) a sábado (turno Noche), contada dentro del período. */
function semanaCalc(s) {
  const d = aFecha(s), ini = periodo(s).ini, dom = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - ini.getDay());
  return Math.floor(Math.round((d - dom) / 864e5) / 7) + 1;
}
/** Total de horas de una actividad (tramo de horómetro): Hasta − Desde. */
const horasTramo = t => (num(t.desde) !== null && num(t.hasta) !== null ? r2(num(t.hasta) - num(t.desde)) : null);
function horasEntre(a, b) {
  if (!a || !b) return null;
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  let min = h2 * 60 + m2 - (h1 * 60 + m1); if (min < 0) min += 1440;
  return r2(min / 60);
}
/** Ventana del turno: inicio y fin reales (el turno noche termina al día siguiente). */
function ventanaTurno(r) {
  const t = (S.M?.turnos || []).find(x => x.id === r.turno); if (!t || !t.inicio || !t.fin) return null;
  const [y, m, d] = r.fecha.split('-').map(Number), [h1, m1] = t.inicio.split(':').map(Number), [h2, m2] = t.fin.split(':').map(Number);
  const ini = new Date(y, m - 1, d, h1, m1), fin = new Date(y, m - 1, d, h2, m2); if (fin <= ini) fin.setDate(fin.getDate() + 1);
  return { ini, fin };
}
const enVentana = (r, cuando = new Date()) => { const v = ventanaTurno(r); return !v || (cuando >= v.ini && cuando <= v.fin); };
/** Fecha y hora local del celular (no UTC), para la BD. */
const tsLocal = s => { if (!s) return ''; const d = new Date(s); return `${iso(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const horaCorta = s => s ? new Date(s).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
/** Turno según el reloj: 06:00–17:59 Día; resto Noche (la madrugada es del turno noche de ayer). */
function turnoReloj(d = new Date()) {
  const hr = d.getHours(), f = new Date(d); if (hr < 6) f.setDate(f.getDate() - 1);
  return [iso(f), hr >= 6 && hr < 18 ? 'd' : 'n'];
}
const blobURL = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });
function urlBlob(u) { const [a, b] = u.split(','); const bin = atob(b), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: a.match(/:(.*?);/)[1] }); }
function descargar(blob, nombre) { const u = URL.createObjectURL(blob), a = h('a', { href: u, download: nombre }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
/** En el celular abre el menú Compartir (WhatsApp, Teams, correo); si no se puede, descarga. */
/** Entrega un archivo: «compartir» abre Compartir del celular (WhatsApp…); si no se puede, lo descarga.
 *  Devuelve false solo si la persona cerró Compartir sin enviar. */
async function entregar(blob, nombre, modo = 'compartir') {
  const f = new File([blob], nombre, { type: blob.type });
  if (modo === 'compartir' && navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nombre }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  descargar(blob, nombre); return true;
}
/** Foto a máx. 1600 px, JPEG 72 %: ~150–300 KB, se lee bien el horómetro. */
async function comprimir(file) {
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(B('formato no soportado', '不支持的格式'))); i.src = URL.createObjectURL(file); });
  if (Math.min(img.naturalWidth, img.naturalHeight) < 200) { URL.revokeObjectURL(img.src); throw new Error(B('la foto mide menos de 200 px por lado; tómela de nuevo', '照片边长小于200像素，请重拍')); }
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.72));
}
let tt;
const msg = (t, ok) => { const e = $('toast'); e.textContent = t; e.className = 'toast on ' + (ok === undefined ? '' : ok ? 'bien' : 'mal'); clearTimeout(tt); tt = setTimeout(() => (e.className = 'toast'), ok === false ? 5200 : 2600); };

/* ====================== Almacenamiento local (IndexedDB) ====================== */
const DB = {
  db: null,
  abrir() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open('telehandler', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('registros', { keyPath: 'id' }); d.createObjectStore('fotos', { keyPath: 'id' }).createIndex('regId', 'regId'); };
      r.onsuccess = () => { this.db = r.result; ok(); }; r.onerror = () => ko(r.error);
    });
  },
  tx(st, modo, fn) { return new Promise((ok, ko) => { const t = this.db.transaction(st, modo), r = fn(t.objectStore(st)); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }); },
  get: (st, k) => DB.tx(st, 'readonly', s => s.get(k)),
  put: (st, v, k) => DB.tx(st, 'readwrite', s => (k === undefined ? s.put(v) : s.put(v, k))),
  del: (st, k) => DB.tx(st, 'readwrite', s => s.delete(k)),
  todos: st => DB.tx(st, 'readonly', s => s.getAll()),
  fotos: regId => DB.tx('fotos', 'readonly', s => s.index('regId').getAll(regId)),
};

/* ====================== Estado y modelo ====================== */
const S = { M: null, aj: {}, vista: 'lista', reg: null, per: '', regs: [] };
const TIPOS = { HI: 'Horómetro inicial', HF: 'Horómetro final', CONS: 'Consumo', FORM: 'Formato de campo', OTRA: 'Otra evidencia' };
const TIPOS_ZH = { HI: '开始小时表', HF: '结束小时表', CONS: '油料消耗', FORM: '现场纸质报表', OTRA: '其他证据' };

function nuevoRegistro() {
  const M = S.M, [f, tn] = turnoReloj();
  const t = M.turnos.find(x => norm(x.nombre).startsWith(tn)) || M.turnos[0] || {};
  const eq = M.equipos.length === 1 ? M.equipos[0].id : '';
  const r = {
    id: uid(), creado: new Date().toISOString(), modificado: '', fecha: f, turno: t.id || '', nReporte: '',
    equipo: eq, area: '', areaOtra: '', operador: '', encargado: S.aj.encargado || '', cargoEnc: S.aj.cargoEnc || 'Vo.Bo. Empresa · 单位审核签字',
    tramos: [{ desde: '', hasta: '', labor: '', area: '', frente: '', obs: '' }], horaIni: t.inicio || '', horaFin: t.fin || '',
    inactivos: {}, consumos: {}, observaciones: '', firmaOp: null, firmaEnc: null,
  };
  // El horómetro inicial arranca donde terminó el último turno del mismo equipo
  const prev = anterior(r, S.regs); const hfPrev = prev ? derivar(prev).hf : null;
  if (hfPrev !== null) r.tramos[0].desde = String(hfPrev);
  return r;
}
const orden = x => x.fecha + '|' + (esNoche(x.turno) ? '2' : '1');
const anterior = (r, todos) => todos.filter(x => x.id !== r.id && x.equipo === r.equipo && orden(x) < orden(r)).sort((a, b) => (orden(a) < orden(b) ? 1 : -1))[0];
/** Un solo reporte por fecha + turno + equipo. */
const duplicado = r => S.regs.find(x => x.id !== r.id && x.fecha === r.fecha && x.turno === r.turno && x.equipo === r.equipo);
const pdfPendiente = r => !r.pdfTs || (r.modificado && r.modificado > r.pdfTs);
const idVisible = r => `TH-${r.fecha.replace(/-/g, '')}-${esNoche(r.turno) ? 'N' : 'D'}`;
const baseNombre = r => `${ddmmaaaa(r.fecha)}_${es(r.turno).replace(/\s+/g, '')}`;

/** Cálculos que se muestran y van al PDF (la BD guarda solo lo capturado). */
function derivar(r, todos) {
  const M = S.M || { personal: [], equipos: [], areas: [], turnos: [], calendario: {} };
  const tr = (r.tramos || []).filter(t => num(t.desde) !== null || num(t.hasta) !== null);
  const desdes = tr.map(t => num(t.desde)).filter(v => v !== null), hastas = tr.map(t => num(t.hasta)).filter(v => v !== null);
  const hi = desdes.length ? Math.min(...desdes) : null, hf = hastas.length ? Math.max(...hastas) : null;
  const horasHor = tr.every(t => num(t.desde) !== null && num(t.hasta) !== null) && tr.length ? r2(tr.reduce((a, t) => a + num(t.hasta) - num(t.desde), 0)) : null;
  const p = todos ? anterior(r, todos) : null; const hfPrev = p ? derivar(p).hf : null;
  const op = M.personal.find(x => x.id === r.operador), eq = M.equipos.find(x => x.id === r.equipo), ar = M.areas.find(x => x.id === r.area), tu = M.turnos.find(x => x.id === r.turno);
  return {
    hi, hf, horasHor, horasOp: horasEntre(r.horaIni, r.horaFin),
    inact: r2(Object.values(r.inactivos || {}).reduce((a, v) => a + (num(v) || 0), 0)),
    prev: p, hfPrev, dif: hfPrev !== null && hi !== null ? r2(hi - hfPrev) : null,
    per: periodo(r.fecha), semana: semanaCalc(r.fecha),
    opNom: op ? op.nombre : r.operador, opCargo: op ? Lm(op.cargo) : L('Operador', '操作员'), opEmp: op ? op.empresa : '',
    eqNom: eq ? `${eq.nombre} ${eq.codigo}`.trim() : r.equipo, eqEmp: eq ? eq.empresa : '',
    arNom: ar ? (norm(ar.nombre) === 'otra' && r.areaOtra ? `Otra · 其他: ${r.areaOtra}` : `${ar.nombre}${ar.codigo ? ' (' + ar.codigo + ')' : ''}`) : r.area,
    turnoNom: tu ? tu.nombre : r.turno, turnoBil: tu ? Lm(tu.nombre) : r.turno, horario: tu ? tu.horario : '',
    labor: (r.tramos || []).map(t => t.labor).filter(Boolean).join(' | '),
  };
}

/* ====================== Armazón ====================== */
function armazon() {
  const nav = (v, txt, ico) => h('button', { 'data-v': v, onclick: () => ir(v) }, svg(ico), txt);
  $('raiz').append(h('div', { class: 'app' },
    h('header', { class: 'top' },
      h('div', { class: 'fila' },
        h('img', { class: 'logo', src: 'app/logo.svg', alt: '' }),
        h('div', { class: 'tit' }, h('span', { class: 'sub' }, 'Control de equipo · 设备管理'), h('h1', { id: 'h1' }, 'Reporte de turno · 班报')),
        h('button', { class: 'pill', id: 'red', type: 'button', title: 'Cambiar tema claro/oscuro · 切换明暗主题', onclick: () => tema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro') },
          h('span', { class: 'punto' }), h('span', { id: 'redt' }, 'En línea · 在线'))),
      h('div', { class: 'chips' }, h('span', { id: 'ch1' }, '—'), h('span', { id: 'ch2' }, '—'), h('span', {}, 'App v' + APP_V), h('span', { id: 'info', class: 'ambar' }, 'Cargando… · 加载中'))),
    h('main', { id: 'main' }),
    h('nav', { class: 'nav' },
      nav('lista', 'Registros · 记录', '<path d="M4 6h16M4 12h16M4 18h10"/>'),
      nav('nuevo', 'Nuevo · 新建', '<path d="M12 5v14M5 12h14"/>'),
      nav('maestro', 'Maestro · 主表', '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'))),
  h('div', { class: 'toast', id: 'toast', role: 'status' }),
  h('datalist', { id: 'dlEnc' }), h('datalist', { id: 'dlFrentes' }));
  const red = () => { $('red').classList.toggle('off', !navigator.onLine); $('redt').textContent = navigator.onLine ? 'En línea · 在线' : 'Sin señal · 无信号'; };
  addEventListener('online', red); addEventListener('offline', red); red();
}
function tema(t) { document.documentElement.dataset.tema = t; try { localStorage.setItem('th_tema', t); } catch (e) {} }
function cabecera() {
  const M = S.M, [f] = turnoReloj();
  $('ch1').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · Período · 结算周期 ' + periodo(f).nombre;
  $('ch2').textContent = M ? M.equipos.map(e => `${e.nombre} ${e.codigo}`).join(', ') : 'Sin equipo · 无设备';
  $('info').textContent = M ? 'Maestro cargado · 主表已加载' : 'Cargue el maestro · 请加载主表'; $('info').className = M ? '' : 'ambar';
  const [t1, t2] = { lista: ['Registros', '记录'], form: S.reg && S.reg._nuevo ? ['Nuevo reporte', '新建班报'] : ['Reporte de turno', '班报'], maestro: ['Maestro', '主表'] }[S.vista];
  $('h1').replaceChildren(t1 + ' ', h('span', { class: 'zh' }, t2));   // chino más pequeño: el encabezado fijo no tapa la pantalla
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === (S.vista === 'form' ? (S.reg && S.reg._nuevo ? 'nuevo' : 'lista') : S.vista)));
}
async function ir(v, reg) {
  await guardarYa();
  S.regs = await DB.todos('registros');
  if (v === 'nuevo') {
    if (!S.M) { msg(B('Primero cargue el maestro en Excel', '请先加载Excel主表'), false); v = 'maestro'; }
    else {
      const n = nuevoRegistro(), ya = duplicado(n);
      S.reg = Object.assign(n, { _nuevo: true });
      if (ya) msg(B(`Ya existe el reporte de este turno (${idVisible(ya)}). Ábralo o cambie la fecha o el turno.`, `本班次报告已存在（${idVisible(ya)}），请打开该报告或更改日期/班次。`));
      v = 'form';
    }
  } else if (v === 'editar') { S.reg = reg; v = 'form'; }
  const aFirmas = reg && reg._aFirmas; if (reg) delete reg._aFirmas;
  S.vista = v; cabecera();
  const main = $('main'); main.innerHTML = '';
  if (v === 'lista') await vLista(main); else if (v === 'form') await vForm(main); else vMaestro(main);
  if (aFirmas && $('firmas')) $('firmas').scrollIntoView(); else scrollTo(0, 0);
}

/* ====================== Vista: registros ====================== */
async function vLista(main) {
  const regs = S.regs.slice().sort((a, b) => (orden(a) < orden(b) ? 1 : -1));
  if (!S.M) main.append(h('div', { class: 'aviso warn' }, B('Para empezar cargue el maestro en Excel (personal, turnos, equipo, áreas). ', '请先加载Excel主表（人员、班次、设备、区域）。'), h('button', { class: 'btn peq', onclick: () => ir('maestro') }, 'Ir a Maestro · 前往主表')));
  const pers = [...new Set(regs.map(r => periodo(r.fecha).codigo))].sort().reverse();
  if (!S.per && pers.length) S.per = pers[0];
  const fil = regs.filter(r => !S.per || periodo(r.fecha).codigo === S.per);
  const horas = r2(fil.reduce((a, r) => a + (derivar(r).horasHor || 0), 0));
  const pend = fil.filter(r => !(r.firmaOp && r.firmaEnc)).length;
  main.append(
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('b', {}, fil.length), h('span', {}, 'Turnos · 班次')),
      h('div', { class: 'kpi' }, h('b', {}, fmt(horas)), h('span', {}, 'Horas horómetro · 小时表工时')),
      h('div', { class: 'kpi' + (pend ? ' al' : '') }, h('b', {}, pend), h('span', {}, 'Sin firmas · 未签名'))),
    h('div', { class: 'card' },
      h('label', { class: 'campo' }, 'Período · 结算周期',
        h('select', { onchange: e => { S.per = e.target.value; ir('lista'); } },
          h('option', { value: '' }, 'Todos los períodos · 全部周期'),
          pers.map(p => { const o = h('option', { value: p }, `${periodoCodigo(p).nombre} (${periodoCodigo(p).rango})`); o.selected = p === S.per; return o; }))),
      h('div', { class: 'btns' },
        h('button', { class: 'btn pri', disabled: !fil.length, onclick: () => exportarExcel(fil) }, 'Excel para la BD · 数据库表'),
        h('button', { class: 'btn', disabled: !fil.length, onclick: () => exportarFotos(fil) }, 'Fotos (ZIP) · 照片')),
      h('small', { style: 'color:var(--gris)' }, B('El Excel trae una fila por turno con códigos (operador, equipo, área) para pegar en la BD; las fotos van con el nombre de la carpeta: DDMMAAAA_Turno_HI.jpeg.', 'Excel每班一行（操作员、设备、区域代码），用于导入数据库；照片按文件夹规则命名。'))));
  if (!fil.length) main.append(h('div', { class: 'aviso info' }, B('Aún no hay reportes en este período. Toque «Nuevo».', '本周期暂无报告，请点击「新建」。')));
  const ult = S.aj.ultimoRespaldo, sinResp = S.regs.filter(r => !ult || (r.modificado || r.creado) > ult).length;
  if (sinResp && (!ult || Date.now() - new Date(ult) > 864e5)) main.append(h('div', { class: 'aviso warn', style: 'display:flex;flex-direction:column;gap:8px' },
    B(`${sinResp} reporte(s) solo están en este celular${ult ? ' desde el último respaldo (' + horaCorta(ult) + ')' : ' y nunca se ha hecho respaldo'}. Si se borra el navegador o se cambia de celular, se pierden.`, `${sinResp}份报告仅保存在本手机${ult ? '（上次备份：' + horaCorta(ult) + '）' : '，且从未备份'}。清除浏览器数据或更换手机将会丢失。`),
    h('button', { class: 'btn peq', type: 'button', onclick: respaldar }, 'Descargar respaldo ahora · 立即备份')));
  const ul = h('ul');
  for (const r of fil) {
    const d = derivar(r, S.regs), firm = r.firmaOp && r.firmaEnc, alerta = d.dif !== null && Math.abs(d.dif) > 0.05;
    ul.append(h('li', { class: 'item', onclick: () => ir('editar', r) },
      h('div', { class: 't' }, h('span', {}, `${fLarga(r.fecha)} · ${d.turnoBil}`), h('span', { class: 'est ' + (firm ? 'ok' : '') }, firm ? 'Firmado · 已签名' : !r.firmaOp ? 'Falta firma operador · 缺操作员签名' : 'Falta Vo.Bo. · 缺审核签字')),
      h('div', { class: 'm' }, `${idVisible(r)}${r.nReporte ? ' · Rep. N° · 报告号 ' + r.nReporte : ''} · ${d.opNom || 'sin operador · 无操作员'} · ${d.arNom || 'sin área · 无区域'}`),
      h('div', {}, `Horómetro · 小时表 ${fmt(d.hi)} → ${fmt(d.hf)} = `, h('b', {}, `${fmt(d.horasHor)} h`),
        alerta ? h('span', { class: 'est mal', style: 'margin-left:6px' }, `Dif. con turno anterior · 与上一班差值 ${fmt(d.dif)}`) : null),
      h('div', { class: 'btns', style: 'gap:6px' },
        duplicado(r) ? h('span', { class: 'est mal' }, 'Duplicado · 重复') : null,
        pdfPendiente(r) ? h('span', { class: 'est' }, r.pdfTs ? 'Cambió después del PDF · PDF后有修改' : 'PDF pendiente · PDF待生成') : h('span', { class: 'est ok' }, 'PDF generado · PDF已生成')),
      h('div', { class: 'btns', style: 'gap:6px' },
        firm ? null : h('button', { class: 'btn peq', type: 'button', onclick: e => { e.stopPropagation(); r._aFirmas = true; ir('editar', r); } },
          enVentana(r) ? 'Firmar ahora · 立即签名' : 'Firmar (fuera del horario del turno) · 签名（班次时间外）'),
        r.firmaOp ? h('button', { class: 'btn peq', type: 'button', onclick: e => { e.stopPropagation(); if (validar(r)) generarPDF(r, 'descargar'); } }, '⬇ PDF · 下载') : null,
        r.firmaOp ? h('button', { class: 'btn peq', type: 'button', onclick: e => { e.stopPropagation(); if (validar(r)) generarPDF(r, 'compartir'); } }, 'WhatsApp · 分享') : null)));
  }
  main.append(ul);
}

/* ====================== Vista: formulario ====================== */
let tGuardar;
function programar() { clearTimeout(tGuardar); tGuardar = setTimeout(guardarYa, 500); const e = $('est'); if (e) e.textContent = 'Guardando… · 保存中'; }
async function guardarYa() {
  clearTimeout(tGuardar); const r = S.reg; if (!r || r._borrado || !r._sucio) return;
  r.modificado = new Date().toISOString(); r._sucio = false;
  const c = { ...r }; delete c._nuevo; delete c._sucio;
  await DB.put('registros', c);
  if (r.encargado) { S.aj.encargado = r.encargado; S.aj.cargoEnc = r.cargoEnc; await DB.put('kv', S.aj, 'ajustes'); }
  const e = $('est'); if (e) e.textContent = 'Guardado en el celular · 已保存 ✓';
}
const tocar = () => { S.reg._sucio = true; programar(); };

async function vForm(main) {
  const r = S.reg, M = S.M || { personal: [], turnos: [], equipos: [], areas: [], inactivos: [], consumos: [], calendario: {} };
  const encs = [...new Set(S.regs.map(x => x.encargado).filter(Boolean))];
  $('dlEnc').innerHTML = ''; encs.forEach(e => $('dlEnc').append(h('option', { value: e })));
  // Frentes: los del maestro (si trae la tabla) más los ya usados en reportes anteriores
  const frentes = [...new Set([...(M.frentes || []).map(f => f.nombre), ...S.regs.flatMap(x => (x.tramos || []).map(t => t.frente)).filter(Boolean)])];
  $('dlFrentes').innerHTML = ''; frentes.forEach(f => $('dlFrentes').append(h('option', { value: f })));

  const campo = (txt, ctrl, ayuda) => h('label', { class: 'campo' }, txt, ctrl, ayuda ? h('small', {}, ayuda) : null);
  const inp = (key, at = {}) => h('input', Object.assign({ value: r[key] ?? '', oninput: e => { r[key] = e.target.value; tocar(); refrescar(); } }, at));
  const sel = (key, lista, alCambiar) => {
    const s = h('select', { onchange: e => { r[key] = e.target.value; tocar(); alCambiar && alCambiar(); refrescar(); } }, h('option', { value: '' }, '— elegir · 请选择 —'),
      lista.map(o => h('option', { value: o.id }, o.txt)));
    s.value = r[key] || ''; return s;
  };
  // Chips para listas cortas
  const chips = (key, lista, alCambiar) => {
    const w = h('div', { class: 'opciones' });
    const pintar = () => { w.innerHTML = ''; lista.forEach(o => w.append(h('button', { type: 'button', class: 'op' + (r[key] === o.id ? ' on' : ''),
      onclick: () => { r[key] = o.id; tocar(); pintar(); alCambiar && alCambiar(); refrescar(); } }, o.txt, o.sub ? h('small', {}, ' ' + o.sub) : null))); };
    pintar(); return w;
  };
  const card = (n, tit, zh, ...hijos) => h('div', { class: 'card' }, h('h2', {}, h('span', {}, n ? h('span', { class: 'paso' }, n) : null, tit), h('small', {}, zh)), ...hijos);

  // --- ID y encabezado
  const avDup = h('div');
  const idb = h('b'); const est = h('span', { id: 'est', style: 'color:var(--gris)' }, r._nuevo ? 'Sin guardar · 未保存' : 'Guardado en el celular · 已保存 ✓');

  // --- Turno y horario del operador
  const hIni = inp('horaIni', { type: 'time' }), hFin = inp('horaFin', { type: 'time' });
  const alTurno = () => { const t = M.turnos.find(x => x.id === r.turno); if (t) { r.horaIni = t.inicio; r.horaFin = t.fin; hIni.value = t.inicio; hFin.value = t.fin; } };

  // --- Área "Otra"
  const otra = campo('¿Cuál área? · 其他区域名称', inp('areaOtra', { type: 'text' }));
  const verOtra = () => { const a = M.areas.find(x => x.id === r.area); otra.style.display = a && norm(a.nombre) === 'otra' ? '' : 'none'; };
  verOtra();

  // --- Tramos de horómetro (como el formato: Desde / Hasta / Labor)
  const cajaTramos = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const pintarTramos = () => {
    cajaTramos.innerHTML = '';
    r.tramos.forEach((t, i) => {
      const tot = h('input', { type: 'text', readonly: true, tabindex: '-1', class: 'total' });
      const verTot = () => { const v = horasTramo(t); tot.value = v === null ? '' : fmt(v) + ' h'; tot.classList.toggle('mal', v !== null && v < 0); };
      const c = (k, at) => h('input', Object.assign({ value: t[k] ?? '', oninput: e => { t[k] = e.target.value; verTot(); tocar(); refrescar(); } }, at));
      verTot();
      cajaTramos.append(h('div', { class: 'tramo' },
        h('div', { class: 'cab' }, h('span', {}, `Actividad · 作业 ${i + 1}`),
          r.tramos.length > 1 ? h('button', { class: 'btn peq mal', type: 'button', onclick: () => { r.tramos.splice(i, 1); tocar(); pintarTramos(); refrescar(); } }, 'Quitar · 删除') : null),
        h('div', { class: 'tres' },
          campo('Desde · 起', c('desde', { type: 'number', inputmode: 'decimal', step: '0.1' })),
          campo('Hasta · 止', c('hasta', { type: 'number', inputmode: 'decimal', step: '0.1' })),
          campo('Total · 合计', tot)),
        campo('Labor · 作业内容', c('labor', { type: 'text', placeholder: 'Ej.: apoyo a cuadrilla · 例：协助班组、装运物料' })),
        M.areas.length > 1 ? campo('Área de esta actividad · 本项作业区域', (() => {
          const s = h('select', { onchange: e => { t.area = e.target.value; tocar(); } }, h('option', { value: '' }, 'La misma del turno · 同本班区域'),
            M.areas.map(a => h('option', { value: a.id }, a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre)));
          s.value = t.area || ''; return s; })()) : null,
        campo('Frente / lugar de trabajo · 工作面/作业地点', c('frente', { type: 'text', list: 'dlFrentes', autocomplete: 'off', placeholder: M.frentes && M.frentes.length ? 'Elija o escriba · 选择或输入' : 'Escriba el frente · 输入工作面' })),
        campo('Observación de la actividad · 作业备注', c('obs', { type: 'text', placeholder: 'Opcional · 选填' }))));
    });
  };
  pintarTramos();

  // --- Consumos del turno: cada turno (Día y Noche) registra los suyos una sola vez en su reporte
  const cajaCons = h('div', { style: 'display:flex;flex-direction:column;gap:10px' }); let claveCons = '';
  async function pintarCons() {
    cajaCons.innerHTML = '';
    if (!M.consumos.length) cajaCons.append(h('div', { class: 'aviso info' }, B('El maestro no trae la tabla «Consumo».', '主表中没有「消耗」表。')));
    M.consumos.forEach(c => cajaCons.append(h('div', { class: 'tres', style: 'align-items:end' },
      h('div', { class: 'campo', style: 'justify-content:center;height:48px' }, Lm(c.nombre)),
      campo(`Cantidad · 数量${c.unidad ? ' (' + c.unidad + ')' : ''}`, numIn(r.consumos, c.id, 'cantidad', '0.01')),
      campo('Horómetro · 小时表', numIn(r.consumos, c.id, 'horometro')))));
    cajaCons.append(await fotos(r, 'CONS', true));
  }

  // --- Resumen en vivo
  const res = h('div', { class: 'res' });
  function refrescar() {
    const d = derivar(r, S.regs); idb.textContent = idVisible(r);
    const dup = duplicado(r); avDup.innerHTML = '';
    if (dup) avDup.append(h('div', { class: 'aviso warn', style: 'display:flex;flex-direction:column;gap:8px' },
      h('b', {}, B(`Ya existe un reporte de este turno (${idVisible(dup)}). Solo puede haber uno por turno: este no podrá generar PDF.`, `本班次报告已存在（${idVisible(dup)}）。每班只能有一份报告，此份不能生成PDF。`)),
      h('div', { class: 'btns' },
        h('button', { class: 'btn peq', type: 'button', onclick: () => ir('editar', dup) }, 'Abrir el existente · 打开已有报告'),
        h('button', { class: 'btn peq mal', type: 'button', onclick: () => eliminar(r) }, 'Descartar este · 放弃此份'))));
    if (!claveCons) { claveCons = 'ok'; pintarCons(); }
    const k = (t, v, cl = '') => h('div', { class: cl }, h('span', {}, t), h('b', {}, v));
    res.innerHTML = '';
    res.append(
      k('Período · 结算周期', d.per.nombre), k('Semana · 周', d.semana),
      k('Horas horómetro · 小时表工时', d.horasHor === null ? '—' : fmt(d.horasHor) + ' h', d.horasHor !== null && d.horasHor < 0 ? 'mal' : ''),
      k('Horas operador · 操作员工时', d.horasOp === null ? '—' : fmt(d.horasOp) + ' h'),
      k('Horas inactivas · 停机工时', fmt(d.inact) + ' h'),
      k('Horómetro · 小时表', `${fmt(d.hi)} → ${fmt(d.hf)}`),
      k('Diferencia con el turno anterior · 与上一班差值', d.dif === null ? 'Sin turno anterior · 无上一班' : `${fmt(d.dif)} h (anterior cerró en · 上一班结束于 ${fmt(d.hfPrev)})`, 'full' + (d.dif !== null && Math.abs(d.dif) > 0.05 ? ' mal' : '')));
    document.querySelectorAll('[data-nom]').forEach(e => { e.firstChild.textContent = e.dataset.nom === 'op' ? (d.opNom || '(operador · 操作员)') : (r.encargado || '(encargado · 负责人)'); });
  }

  const numIn = (obj, key, sub, paso = '0.1') => h('input', { type: 'number', inputmode: 'decimal', step: paso, min: '0', value: (sub ? obj[key]?.[sub] : obj[key]) ?? '',
    oninput: e => { if (sub) { obj[key] = obj[key] || {}; obj[key][sub] = e.target.value; } else obj[key] = e.target.value; tocar(); refrescar(); } });

  main.append(
    h('div', { class: 'idreg' }, h('span', {}, 'ID del reporte · 报告编号', h('br'), est), idb),
    avDup,

    card(1, 'Datos del turno', '班次信息',
      h('div', { class: 'dos' },
        campo('Fecha · 日期', inp('fecha', { type: 'date' })),
        campo('N.º reporte · 报告编号', inp('nReporte', { type: 'text', inputmode: 'numeric', placeholder: 'Del formato · 见纸质表' }))),
      h('div', { class: 'campo' }, 'Turno · 班次', chips('turno', M.turnos.map(t => ({ id: t.id, txt: Lm(t.nombre), sub: t.inicio ? `${t.inicio}–${t.fin}` : '' })), alTurno)),
      h('small', { style: 'color:var(--gris)' }, B('El turno noche lleva la fecha del día en que empieza.', '夜班按开始当天的日期记录。')),
      campo('Equipo · 设备', sel('equipo', M.equipos.map(e => ({ id: e.id, txt: `${e.nombre} ${e.codigo}${e.empresa ? ' · ' + e.empresa : ''}` })))),
      h('div', { class: 'campo' }, 'Área principal del turno · 本班主要区域', chips('area', M.areas.map(a => ({ id: a.id, txt: a.codigo || Lm(a.nombre), sub: a.codigo ? Lm(a.nombre) : '' })), verOtra)),
      otra),

    card(2, 'Personal', '人员',
      h('div', { class: 'campo' }, 'Operador · 操作员', chips('operador', M.personal.map(p => ({ id: p.id, txt: p.nombre, sub: p.codigo })))),
      campo('Nombre del encargado de la empresa · 单位负责人姓名', inp('encargado', { type: 'text', list: 'dlEnc', autocomplete: 'off' }), B('Quien da el Vo.Bo. del turno. Se recuerda para el siguiente reporte.', '负责本班审核签字，下次自动带出。')),
      campo('Cargo del encargado · 负责人职务', inp('cargoEnc', { type: 'text' }))),

    card(3, 'Actividades · horómetro', '作业 · 小时表',
      cajaTramos,
      h('button', { class: 'btn', type: 'button', onclick: () => { const ult = r.tramos[r.tramos.length - 1]; r.tramos.push({ desde: ult && ult.hasta || '', hasta: '', labor: '', area: '', frente: '', obs: '' }); tocar(); pintarTramos(); refrescar(); } }, '＋ Agregar actividad · 添加作业'),
      await fotos(r, 'HI', false), await fotos(r, 'HF', false)),

    card(4, 'Tiempo del operador', '操作员工时',
      h('div', { class: 'dos' }, campo('De · 从', hIni), campo('A · 至', hFin))),

    card(5, 'Tiempo inactivo (opcional)', '停机时间（选填）',
      h('small', { style: 'color:var(--gris)' }, B('Solo si hubo. Si se deja vacío, el reporte se guarda igual y cuenta como 0 h.', '仅在有停机时填写；不填也可保存，按0小时表。')),
      M.inactivos.length ? h('div', { class: 'dos' }, M.inactivos.map(c => campo(Lm(c.nombre), numIn(r, 'inactivos', c.id))))
        : h('div', { class: 'aviso info' }, B('El maestro no trae la tabla «Tiempos de Operación».', '主表中没有「运行时间」表。'))),

    card(6, 'Consumos del turno', '本班油料消耗', cajaCons),

    card(7, 'Evidencias', '证据照片', await fotos(r, 'FORM', true), await fotos(r, 'OTRA', true)),

    card(8, 'Observaciones', '备注',
      h('label', { class: 'campo' }, h('textarea', { oninput: e => { r.observaciones = e.target.value; tocar(); } }, r.observaciones))),

    card(null, 'Resumen', '汇总', res),

    Object.assign(card(9, 'Firmas', '签名',
      firma(L('Firma del operador *', '操作员签名（必填）'), 'firmaOp', 'op'),
      firma(L('Vo.Bo. empresa (encargado)', '单位审核签字（负责人）'), 'firmaEnc', 'enc')), { id: 'firmas' }),

    h('div', { class: 'guardar' },
      h('button', { class: 'btn pri', onclick: async () => { if (!r.modificado) r._sucio = true; await guardarYa(); if (validar(r)) generarPDF(r, 'descargar'); } }, 'Descargar PDF · 下载PDF'),
      h('button', { class: 'btn pri', style: 'background:#25D366;border-color:#25D366', onclick: async () => { if (!r.modificado) r._sucio = true; await guardarYa(); if (validar(r)) generarPDF(r, 'compartir'); } }, 'Compartir PDF (WhatsApp) · 分享PDF'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn osc', onclick: async () => { if (!r.modificado) r._sucio = true; await guardarYa(); msg(B('Reporte guardado', '报告已保存'), true); ir('lista'); } }, 'Guardar · 保存'),
        h('button', { class: 'btn mal', onclick: () => eliminar(r) }, 'Eliminar · 删除'))));
  // Las cajas de texto también actualizan los nombres bajo la firma
  refrescar();
}

function validar(r) {
  const d = derivar(r), f = [];
  const z = [];
  const falta = (e, c) => { f.push(e); z.push(c); };
  if (!r.fecha) falta('fecha', '日期'); if (!r.turno) falta('turno', '班次'); if (!r.equipo) falta('equipo', '设备'); if (!r.area) falta('área', '区域');
  if (!r.operador) falta('operador', '操作员'); if (!r.encargado) falta('nombre del encargado', '负责人姓名');
  if (d.hi === null || d.hf === null || d.horasHor === null) falta('horómetro desde/hasta', '小时表起止读数');
  if (f.length) { msg(B('Falta: ' + f.join(', '), '缺少：' + z.join('、')), false); return false; }
  const dup = duplicado(r); if (dup) { msg(B(`Ya existe el reporte de este turno (${idVisible(dup)}). Abra ese o descarte este.`, `本班次报告已存在（${idVisible(dup)}），请打开该报告或放弃此份。`), false); return false; }
  if (r.tramos.some(t => num(t.hasta) < num(t.desde))) { msg(B('Un «Hasta» del horómetro es menor que su «Desde»', '小时表「止」读数小于「起」读数'), false); return false; }
  if (!r.firmaOp) { msg(B('Falta la firma del operador: es obligatoria para generar el PDF', '缺少操作员签名：生成PDF必须签名'), false); $('firmas')?.scrollIntoView({ behavior: 'smooth' }); return false; }
  // Avisos que no impiden generar el PDF
  const avisos = [], az = [];
  if (!r.firmaEnc) { avisos.push('el PDF sale sin Vo.Bo. de la empresa (puede reabrir el reporte para que firme y generarlo de nuevo)'); az.push('PDF无单位审核签字（可重新打开报告签字后再生成）'); }
  else if (r.firmaEncTs && !enVentana(r, new Date(r.firmaEncTs))) { avisos.push('el Vo.Bo. se firmó fuera del horario del turno'); az.push('审核签字时间在班次时间外'); }
  if (d.horasOp !== null && d.horasHor !== null && d.horasHor + d.inact > d.horasOp + 0.05) { avisos.push('horas de equipo + inactivas superan el tiempo del operador'); az.push('设备工时加停机时间超过操作员工时'); }
  if (avisos.length) msg(B('Ojo: ' + avisos.join('; '), '注意：' + az.join('；')));
  return true;
}
async function eliminar(r) {
  if (!confirm(B('¿Eliminar este reporte y sus fotos del celular?', '确定从手机删除此报告及其照片？'))) return;
  r._borrado = true; clearTimeout(tGuardar);
  for (const f of await DB.fotos(r.id)) await DB.del('fotos', f.id);
  await DB.del('registros', r.id); S.reg = null; msg(B('Reporte eliminado', '报告已删除')); ir('lista');
}

/* ---------- fotos ---------- */
async function fotos(r, tipo, varias) {
  const caja = h('div', { class: 'mini' });
  const pintar = async () => {
    caja.innerHTML = '';
    const fs = (await DB.fotos(r.id)).filter(f => f.tipo === tipo).sort((a, b) => a.orden - b.orden);
    for (const f of fs) {
      const u = URL.createObjectURL(f.blob);
      caja.append(h('span', {}, h('img', { src: u, alt: TIPOS[tipo] }), h('b', { title: 'Quitar · 删除', onclick: async () => { if (confirm(B('¿Quitar esta foto?', '删除这张照片？'))) { await DB.del('fotos', f.id); pintar(); } } }, '×')));
    }
    if (varias || !fs.length) {
      const inp = h('input', { type: 'file', accept: 'image/*', multiple: varias || null, hidden: true, onchange: async e => {
        const lista = [...e.target.files]; if (!lista.length) return;
        if (!r.modificado) r._sucio = true; await guardarYa();        // la foto necesita que el reporte exista
        let o = fs.length ? Math.max(...fs.map(x => x.orden)) + 1 : 0;
        for (const file of lista) {
          try { await DB.put('fotos', { id: uid(), regId: r.id, tipo, orden: o++, blob: await comprimir(file), fecha: new Date().toISOString() }); }
          catch (err) { msg(B('No se pudo leer la foto', '无法读取照片') + '\n' + err.message, false); }
        }
        pintar();
      } });
      caja.append(h('button', { class: 'add', type: 'button', onclick: () => inp.click() }, h('i', {}, '📷'), fs.length ? 'Otra · 再拍' : 'Foto · 拍照'), inp);
    }
  };
  await pintar();
  return h('div', { class: 'campo' }, h('span', { class: 'fotos-t' }, `Foto ${TIPOS[tipo].toLowerCase()} · ${TIPOS_ZH[tipo]}照片${varias ? ' (una o varias · 可多张)' : ''}`), caja);
}

/* ---------- firma táctil ---------- */
/** La firma se guarda a 480 px de ancho, fondo blanco, JPEG: ~15 KB en vez de 1 MB. */
function firmaLiviana(cv) {
  const w = 480, hh = Math.round(cv.height * w / cv.width), c = document.createElement('canvas'); c.width = w; c.height = hh;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); x.drawImage(cv, 0, 0, w, hh);
  return c.toDataURL('image/jpeg', 0.85);
}
function firma(titulo, campo, quien) {
  const r = S.reg, cv = h('canvas', { class: 'firma' }); let cx, dib = false, trazo = false;
  const cuando = h('small', { style: 'color:var(--gris)' });
  const pintarCuando = () => { const ts = r[campo + 'Ts']; cuando.textContent = r[campo] ? (ts ? `Firmó · 签于 ${horaCorta(ts)}${enVentana(r, new Date(ts)) ? '' : ' · fuera del horario del turno · 班次时间外'}` : 'Firmado · 已签名') : (quien === 'enc' ? B('Puede firmar ahora o reabrir el reporte más tarde, dentro del turno.', '可现在签字，或在班次时间内重新打开报告再签。') : B('Obligatoria para generar el PDF.', '生成PDF必须签名。')); };
  pintarCuando();
  const preparar = () => {
    const b = cv.getBoundingClientRect(), k = devicePixelRatio || 1;
    cv.width = b.width * k; cv.height = b.height * k; cx = cv.getContext('2d'); cx.scale(k, k);
    cx.lineWidth = 2.4; cx.lineCap = cx.lineJoin = 'round'; cx.strokeStyle = '#0B1F3A';
    if (r[campo]) { const i = new Image(); i.onload = () => cx.drawImage(i, 0, 0, b.width, b.height); i.src = r[campo]; }
  };
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); dib = true; cx.beginPath(); cx.moveTo(...pos(e)); };
  cv.onpointermove = e => { if (!dib) return; e.preventDefault(); cx.lineTo(...pos(e)); cx.stroke(); trazo = true; };
  cv.onpointerup = cv.onpointercancel = () => {
    if (!dib) return; dib = false; if (!trazo) return;
    const nuevo = !r[campo]; r[campo] = firmaLiviana(cv); r[campo + 'Ts'] = new Date().toISOString(); pintarCuando(); tocar();
    if (nuevo && !enVentana(r)) { const v = ventanaTurno(r); msg(B(`Ojo: la firma quedó fuera del horario del turno (${horaCorta(v.ini.toISOString())} a ${horaCorta(v.fin.toISOString())}). Queda registrada con su hora.`, `注意：签名时间在班次时间外（${horaCorta(v.ini.toISOString())} 至 ${horaCorta(v.fin.toISOString())}），已记录签名时间。`)); }
  };
  requestAnimationFrame(preparar);
  return h('div', { class: 'campo' }, titulo, cv,
    h('div', { class: 'firma-nom', 'data-nom': quien }, '', h('small', {}, quien === 'op' ? 'Operador · 操作员' : 'Encargado de la empresa · 单位负责人')),
    h('button', { class: 'btn peq', type: 'button', onclick: () => { cx.clearRect(0, 0, cv.width, cv.height); r[campo] = null; r[campo + 'Ts'] = null; trazo = false; pintarCuando(); tocar(); } }, 'Borrar firma · 清除签名'),
    cuando);
}

/* ====================== Vista: maestro y respaldo ====================== */
function vMaestro(main) {
  const M = S.M;
  const lista = (t, items) => h('div', {}, h('b', {}, t), h('ul', {}, items.map(i => h('li', {}, i))));
  main.append(
    h('div', { class: 'card dest' }, h('h2', {}, 'Maestro · 主表'),
      h('div', { class: 'aviso ' + (M ? 'ok' : 'info') }, M ? `Cargado · 已加载: ${M.archivo} (${new Date(M.cargado).toLocaleString('es-CO')})` : 'Sin maestro cargado. · 未加载主表。'),
      h('label', { class: 'campo' }, 'Cargar Maestro.xlsx · 加载主表',
        h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls', style: 'height:auto;padding:10px', onchange: async e => {
          const f = e.target.files[0]; if (!f) return;
          try { const m = Maestro.leer(await f.arrayBuffer(), f.name); await DB.put('kv', m, 'maestro'); S.M = m; msg(B('Maestro guardado en el celular', '主表已保存到手机'), true); ir('maestro'); }
          catch (err) { msg(err.message, false); }
        } })),
      h('small', { style: 'color:var(--gris)' }, B('El maestro queda solo en este celular; no se sube a internet ni al repositorio. Vuelva a cargarlo cuando cambie el personal, las áreas o el calendario.', '主表仅保存在本手机，不会上传。人员、区域或日历变更时请重新加载。'))),
    M ? h('div', { class: 'card lista-m' }, h('h2', {}, 'Contenido · 内容'),
      lista('Personal · 人员', M.personal.map(p => `${p.nombre} (${p.codigo}) · ${Lm(p.cargo)}`)),
      lista('Turnos · 班次', M.turnos.map(t => `${Lm(t.nombre)}: ${t.horario}`)),
      lista('Equipos · 设备', M.equipos.map(e => `${Lm(e.nombre)} ${e.codigo} · ${e.empresa}`)),
      lista('Áreas · 区域', M.areas.map(a => `${Lm(a.nombre)}${a.codigo ? ' (' + a.codigo + ')' : ''}`)),
      lista('Tiempo inactivo · 停机时间', M.inactivos.map(c => Lm(c.nombre))),
      lista('Consumos · 油料消耗', M.consumos.map(c => `${Lm(c.nombre)}${c.unidad ? ' (' + c.unidad + ')' : ''}`)),
      lista('Frentes de trabajo · 工作面', (M.frentes || []).length ? M.frentes.map(f => Lm(f.nombre)) : ['(sin tabla «Frente»: el operador lo escribe · 无工作面表，由操作员填写)']),
      h('small', {}, `Calendario · 日历: ${Object.keys(M.calendario).length} días · 天`)) : null,
    h('div', { class: 'card' }, h('h2', {}, 'Respaldo del celular · 备份'),
      h('small', { style: 'color:var(--gris)' }, B('Si cambia de celular o borra los datos del navegador, se pierden los reportes. Descargue un respaldo (reportes, fotos y firmas) y guárdelo en un lugar seguro.', '更换手机或清除浏览器数据会丢失报告。请下载备份（报告、照片、签名）并妥善保存。')),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: respaldar }, 'Descargar respaldo · 下载备份'),
        h('label', { class: 'btn', style: 'display:flex;align-items:center;justify-content:center' }, 'Restaurar · 恢复',
          h('input', { type: 'file', accept: '.json', hidden: true, onchange: e => restaurar(e.target.files[0]) })))),
    h('small', { style: 'color:var(--gris);text-align:center', id: 'almac' }, `App v${APP_V} · funciona sin señal · 可离线使用`));
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(ok => { const e = $('almac'); if (e) e.textContent += ok ? ' · almacenamiento protegido · 存储受保护 ✓' : ' · el navegador puede borrar datos: instale la app en la pantalla de inicio y haga respaldos · 浏览器可能清除数据：请将应用添加到主屏幕并定期备份'; });
}
async function respaldar() {
  const out = { app: 'telehandler', v: APP_V, fecha: new Date().toISOString(), registros: await DB.todos('registros'), fotos: [] };
  for (const f of await DB.todos('fotos')) { const { blob, ...x } = f; out.fotos.push({ ...x, data: await blobURL(blob) }); }
  await entregar(new Blob([JSON.stringify(out)], { type: 'application/json' }), `respaldo_telehandler_${ddmmaaaa(iso(new Date()))}_${p2(new Date().getHours())}${p2(new Date().getMinutes())}.json`);
  S.aj.ultimoRespaldo = out.fecha; await DB.put('kv', S.aj, 'ajustes'); msg(B(`Respaldo listo: ${out.registros.length} reportes y ${out.fotos.length} fotos`, `备份完成：${out.registros.length}份报告，${out.fotos.length}张照片`), true);
}
async function restaurar(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text()); if (d.app !== 'telehandler') throw new Error(B('no es un respaldo de esta app', '不是本应用的备份文件'));
    const actuales = Object.fromEntries((await DB.todos('registros')).map(x => [x.id, x]));
    for (const r of d.registros) { const a = actuales[r.id]; if (!a || (r.modificado || r.creado) >= (a.modificado || a.creado)) await DB.put('registros', r); }
    for (const f of d.fotos) { const { data, ...x } = f; await DB.put('fotos', { ...x, blob: urlBlob(data) }); }
    msg(B(`Restaurados ${d.registros.length} reportes`, `已恢复${d.registros.length}份报告`), true); ir('lista');
  } catch (e) { msg(B('No se pudo restaurar', '恢复失败') + '\n' + e.message, false); }
}

/* ====================== Datos para la BD ======================
 * Mismo bloque de campos en el PDF (metadato + página «Datos para la BD») y en el Excel.
 * Solo lo capturado, con códigos del maestro; los cálculos van en el dashboard. */
const VERSION_FORMATO = 1;
const nombreFoto = (r, f, i) => `${baseNombre(r)}_${f.tipo === 'HI' || f.tipo === 'HF' ? f.tipo : f.tipo + (i + 1)}.jpeg`;
const nombrePDF = r => `${r.fecha.replace(/-/g, '')}_${es(derivar(r).turnoNom).replace(/\s+/g, '')}_${r.equipo || 'EQUIPO'}.pdf`;
function datosBD(r) {
  const M = S.M || { inactivos: [], consumos: [] }, d = derivar(r);
  const causas = M.inactivos.length ? M.inactivos.map(c => c.id) : Object.keys(r.inactivos || {});
  const o = {
    VersionFormato: VERSION_FORMATO, VersionApp: APP_V, ID: idVisible(r), UUID: r.id,
    FechaRegistro: tsLocal(r.modificado || r.creado),
    Fecha: r.fecha, Turno: es(d.turnoNom), Periodo: d.per.codigo, Semana: d.semana, NumReporte: r.nReporte,
    CodOperador: r.operador, Encargado: r.encargado, CargoEncargado: r.cargoEnc,
    CodEquipo: r.equipo, CodArea: r.area, AreaOtra: r.areaOtra,
    HorometroInicial: d.hi, HorometroFinal: d.hf, HorasHorometro: d.horasHor, HoraInicio: r.horaIni, HoraFin: r.horaFin, HorasOperador: d.horasOp,
  };
  for (const c of causas) o['HInact_' + slug(c).replace(/(^|_)([a-z])/g, (m, a, b) => a + b.toUpperCase())] = num(r.inactivos?.[c]) ?? 0;
  o.HInact_Total = d.inact;
  Object.assign(o, {
    Labor: d.labor, Observaciones: r.observaciones,
    FirmaOperador: r.firmaOp ? 'SI' : 'NO', FechaFirmaOperador: tsLocal(r.firmaOpTs),
    FirmaEncargado: r.firmaEnc ? 'SI' : 'NO', FechaFirmaEncargado: tsLocal(r.firmaEncTs),
    FirmaEncargadoEnTurno: r.firmaEnc ? (r.firmaEncTs ? (enVentana(r, new Date(r.firmaEncTs)) ? 'SI' : 'NO') : '') : '',
    Tramos: (r.tramos || []).filter(t => t.desde !== '' || t.hasta !== '').map((t, i) => ({ Tramo: i + 1, Desde: num(t.desde), Hasta: num(t.hasta), Horas: horasTramo(t), Labor: t.labor, CodArea: t.area || r.area, Frente: t.frente || '', Observacion: t.obs || '' })),
    Consumos: Object.entries(r.consumos || {}).filter(([, v]) => num(v.cantidad) !== null || num(v.horometro) !== null)
      .map(([k, v]) => ({ Consumo: k, Cantidad: num(v.cantidad), Unidad: (M.consumos.find(c => c.id === k) || {}).unidad || '', Horometro: num(v.horometro) })),
  });
  return o;
}
async function exportarExcel(regs) {
  const filas = [], tramos = [], cons = [];
  for (const r of regs.slice().sort((a, b) => (orden(a) > orden(b) ? 1 : -1))) {
    const o = datosBD(r), fs = (await DB.fotos(r.id)).sort((a, b) => a.orden - b.orden);
    const rutas = t => fs.filter(f => f.tipo === t).map((f, i) => nombreFoto(r, f, i)).join('; ');
    const { Tramos, Consumos, ...plano } = o;
    filas.push(Object.assign(plano, { Foto_HI: rutas('HI'), Foto_HF: rutas('HF'), Foto_Formato: rutas('FORM'), Foto_Consumo: rutas('CONS'), Foto_Otras: rutas('OTRA'), PDF: nombrePDF(r) }));
    Tramos.forEach(t => tramos.push({ ID: o.ID, ...t })); Consumos.forEach(c => cons.push({ ID: o.ID, ...c }));
  }
  const wb = XLSX.utils.book_new();
  const hoja = (datos, nom) => { const ws = XLSX.utils.json_to_sheet(datos.length ? datos : [{}]); ws['!cols'] = Object.keys(datos[0] || {}).map(k => ({ wch: Math.max(10, Math.min(36, k.length + 2)) })); XLSX.utils.book_append_sheet(wb, ws, nom); };
  hoja(filas, 'Registros'); hoja(tramos, 'Tramos'); hoja(cons, 'Consumos');
  entregar(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Registros_Telehandler_${S.per || 'todos'}.xlsx`);
}
async function exportarFotos(regs) {
  const zip = new JSZip(); let n = 0;
  for (const r of regs) {
    const fs = (await DB.fotos(r.id)).sort((a, b) => a.orden - b.orden), cuenta = {};
    for (const f of fs) { cuenta[f.tipo] = (cuenta[f.tipo] ?? -1) + 1; zip.file(`${baseNombre(r)}/${nombreFoto(r, f, cuenta[f.tipo])}`, f.blob); n++; }
  }
  if (!n) return msg(B('Estos reportes no tienen fotos', '这些报告没有照片'), false);
  msg(B('Armando ZIP…', '正在打包ZIP…'));
  entregar(await zip.generateAsync({ type: 'blob' }), `Fotos_Telehandler_${S.per || 'todos'}.zip`);
}

/* ====================== Arranque ====================== */
(async () => {
  try { tema(localStorage.getItem('th_tema') || 'claro'); } catch (e) {}
  armazon();
  try {
    await DB.abrir();
    S.M = (await DB.get('kv', 'maestro')) || null; S.aj = (await DB.get('kv', 'ajustes')) || {};
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  } catch (e) { msg(B('Este navegador no permite guardar sin señal', '此浏览器不支持离线保存') + '\n' + e.message, false); return; }
  ir(S.M ? 'lista' : 'maestro');
  addEventListener('pagehide', guardarYa); document.addEventListener('visibilitychange', () => document.hidden && guardarYa());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
})();
