/* PDF del turno, generado en el celular (sin señal).
 * Página 1: reporte con firmas del operador y Vo.Bo. de la empresa al final.
 * Anexo: fotos en su resolución guardada (JPEG sin recomprimir, ≥200 px por lado).
 * Última página «Datos para la BD»: bloque CLAVE: valor entre marcas fijas, para que el agente
 * llene la BD sin digitar. El mismo bloque va en JSON en el metadato «Keywords» del PDF.
 * Etiquetas en español · chino simplificado: se incrusta un subconjunto de Noto Sans SC (licencia OFL,
 * app/vendor/fonts). Si la fuente no carga, el PDF sale solo en español con Helvetica. */
'use strict';

/** Fuente china para jsPDF: se lee una vez (queda en la caché del service worker para trabajar sin señal). */
const FUENTES = { normal: 'app/vendor/fonts/NotoSansSC-Regular-sub.ttf', bold: 'app/vendor/fonts/NotoSansSC-Bold-sub.ttf' };
const _fuentes = {};
async function fuenteB64(url) {
  if (_fuentes[url]) return _fuentes[url];
  const b = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return (_fuentes[url] = btoa(s));
}
async function cargarFuentes(doc) {
  try {
    for (const [estilo, url] of Object.entries(FUENTES)) {
      const arch = url.split('/').pop(); doc.addFileToVFS(arch, await fuenteB64(url)); doc.addFont(arch, 'NotoSC', estilo);
    }
    return 'NotoSC';
  } catch (e) { console.warn('Fuente china no disponible; PDF solo en español', e); return null; }
}

const PDF_INICIO = '### DATOS_BD_TELEHANDLER ###', PDF_FIN = '### FIN_DATOS_BD ###';

async function generarPDF(r, modo = 'descargar') {
  const aviso = $('toast').classList.contains('on');   // aviso de validar() abierto: no taparlo
  if (!aviso) msg(B('Generando PDF…', '正在生成PDF…'));   // no tapar un aviso de validar()
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 14, OSC = [31, 42, 51], AMB = [255, 102, 0];
  const d = derivar(r, S.regs), o = datosBD(r);
  const FZ = await cargarFuentes(doc), FN = FZ || FN;
  const sinZh = t => String(t ?? '').replace(/\s*·?\s*[\u2e80-\u9fff\uff00-\uffef（）、，。：]+.*$/u, '');
  const Z = (es, zh) => (FZ && zh ? `${es} · ${zh}` : es);                  // etiqueta bilingüe
  const V = t => (FZ ? String(t ?? '') : sinZh(t));                          // valor del maestro ya bilingüe
  let textoCrudo = doc.text.bind(doc), cortarCrudo = doc.splitTextToSize.bind(doc);   // bloque de datos: valores exactos
  if (FZ) {   // en Noto Sans SC el «·» es de ancho completo: en el PDF se usa « | » como separador
    const sep = t => (typeof t === 'string' ? t.replace(/\s*·\s*/g, ' | ') : Array.isArray(t) ? t.map(sep) : t);
    doc.text = (t, ...a) => textoCrudo(sep(t), ...a); doc.splitTextToSize = (t, ...a) => cortarCrudo(sep(t), ...a);
  }
  let y = 0;

  // ---- encabezado (estilo de la familia de apps)
  doc.setFillColor(...OSC); doc.rect(0, 0, W, 26, 'F'); doc.setFillColor(...AMB); doc.rect(0, 26, W, 1.6, 'F');
  try { doc.addImage(await logoPNG(), 'JPEG', M, 4, 18, 18); } catch (e) {}
  doc.setTextColor(255); doc.setFont(FN, 'bold'); doc.setFontSize(15);
  doc.text(Z('REPORTE DIARIO DE EQUIPO', '设备日报'), M + 22, 12);
  doc.setFont(FN, 'normal'); doc.setFontSize(9.5);
  doc.text(`${d.eqNom}${d.eqEmp ? '  ·  ' + d.eqEmp : ''}`, M + 22, 19);
  doc.setFont(FN, 'bold'); doc.setFontSize(11);
  doc.text(`N.º ${r.nReporte || '—'}`, W - M, 11, { align: 'right' });
  doc.setFont(FN, 'normal'); doc.setFontSize(9);
  doc.text(`${idVisible(r)}  ·  ${fLarga(r.fecha)}  ·  ${V(d.turnoBil)}`, W - M, 19, { align: 'right' });
  doc.setTextColor(20); y = 34;

  const titulo = t => { doc.setFont(FN, 'bold'); doc.setFontSize(10); doc.setTextColor(...OSC); doc.text(t.toUpperCase(), M, y); doc.setDrawColor(...AMB); doc.setLineWidth(.6); doc.line(M, y + 1.6, W - M, y + 1.6); doc.setLineWidth(.2); y += 6.5; doc.setTextColor(20); };
  const pares = items => {
    const cw = (W - 2 * M) / 2; doc.setFontSize(8.8);
    for (let i = 0; i < items.length; i += 2) {
      let alto = 6.5;
      [items[i], items[i + 1]].forEach((it, j) => {
        if (!it) return; const x = M + j * cw;
        const et = Array.isArray(it[0]) ? it[0] : [it[0]];
        doc.setFont(FN, 'normal'); doc.setTextColor(95); doc.text(et[0], x + 1.5, y + 3);
        if (FZ && et[1]) { doc.setFontSize(7.4); doc.text(et[1], x + 1.5, y + 6.6); doc.setFontSize(8.8); alto = Math.max(alto, 8.6); }
        doc.setFont(FN, 'bold'); doc.setTextColor(20);
        const l = doc.splitTextToSize(String(it[1] ?? '—') || '—', cw - 48); doc.text(l, x + 46, y + 3); alto = Math.max(alto, l.length * 3.8 + 2.8);
      });
      doc.setDrawColor(210); doc.rect(M, y - .8, W - 2 * M, alto); y += alto;
    }
    y += 3.5;
  };
  const tabla = (cab, filas, anchos) => {
    const altoC = FZ ? 9.4 : 6;
    doc.setFontSize(8.6); let x = M; doc.setFillColor(240, 240, 236); doc.rect(M, y - .8, W - 2 * M, altoC, 'F');
    doc.setFont(FN, 'bold'); cab.forEach((c, i) => {
      const [es, zh] = Array.isArray(c) ? c : [c]; doc.text(es, x + 1.5, y + 3);
      if (FZ && zh) { doc.setFontSize(7.4); doc.text(zh, x + 1.5, y + 6.6); doc.setFontSize(8.6); }
      x += anchos[i];
    }); y += altoC;
    doc.setFont(FN, 'normal');
    for (const f of filas) {
      x = M; let alto = 6;
      const ls = f.map((v, i) => doc.splitTextToSize(String(v ?? ''), anchos[i] - 3)); ls.forEach(l => (alto = Math.max(alto, l.length * 3.8 + 2.4)));
      ls.forEach((l, i) => { doc.text(l, x + 1.5, y + 3); x += anchos[i]; });
      doc.setDrawColor(210); doc.rect(M, y - .8, W - 2 * M, alto); y += alto;
    }
    y += 3.5;
  };
  const parrafo = t => { doc.setFont(FN, 'normal'); doc.setFontSize(8.8); const l = doc.splitTextToSize(t || '—', W - 2 * M - 3); doc.text(l, M + 1.5, y + 2); y += l.length * 3.8 + 4; };
  const cabe = alto => { if (y + alto > H - 16) { doc.addPage(); y = M + 4; } };

  titulo(Z('Datos del turno', '班次信息'));
  pares([[['Fecha', '日期'], fLarga(r.fecha)], [['Turno', '班次'], `${V(d.turnoBil)}${d.horario ? ' (' + d.horario + ')' : ''}`],
    [['Período', '结算周期'], `${d.per.nombre} (${d.per.rango}) · ${Z('semana', '周')} ${d.semana}`], [['Área', '作业区域'], V(Lm(d.arNom))],
    [['Operador', '操作员'], d.opNom], [['Encargado empresa', '单位负责人'], r.encargado]]);
  titulo(Z('Actividades · tiempo de equipo (horómetro)', '作业内容 · 设备小时表时间'));
  const anchoL = (W - 2 * M - 104) / 2;
  tabla([['N.º', '序号'], ['Desde', '起始读数'], ['Hasta', '结束读数'], ['Total h', '小时'], ['Área · frente', '区域 · 工作面'], ['Labor / actividad', '作业内容'], ['Observación', '备注']],
    [...o.Tramos.map(t => [t.Tramo, fmt(t.Desde), fmt(t.Hasta), t.Horas === null ? '' : fmt(t.Horas), [t.CodArea, t.Frente].filter(Boolean).join(' · '), t.Labor, t.Observacion]),
      ['', '', Z('TOTAL', '合计'), d.horasHor === null ? '' : fmt(d.horasHor), '', '', '']], [10, 19, 19, 16, 40, anchoL, anchoL]);
  pares([[['Total horas', '总小时'], d.horasHor === null ? '—' : fmt(d.horasHor) + ' h'],
    [['Dif. turno anterior', '与上一班小时表差值'], d.dif === null ? Z('Sin turno anterior', '无上一班') : `${fmt(d.dif)} h`],
    [['Tiempo operador', '操作员工作时间'], `${r.horaIni || '—'} – ${r.horaFin || '—'}`], [['Horas operador', '操作员工时'], d.horasOp === null ? '—' : fmt(d.horasOp) + ' h']]);
  const inact = (S.M?.inactivos || []).map(c => [[c.nombre.split('/')[0].trim(), zhDe(c.nombre)], fmt(num(r.inactivos?.[c.id]) ?? 0) + ' h']);
  if (inact.length) { titulo(`${Z('Tiempo inactivo', '停机时间')} · total ${fmt(d.inact)} h`); pares(inact); }
  if (o.Consumos.length) { cabe(24); titulo(Z('Consumos del turno', '本班油料消耗')); tabla([['Consumo', '消耗品'], ['Cantidad', '数量'], ['Unidad', '单位'], ['Horómetro', '小时表读数']], o.Consumos.map(c => [V(Lm(c.Consumo)), fmt(c.Cantidad, 2), V(Lm(c.Unidad)), fmt(c.Horometro)]), [70, 36, 36, W - 2 * M - 142]); }
  cabe(16); titulo(Z('Observaciones', '备注')); parrafo(r.observaciones);

  // ---- firmas abajo
  const altoF = 44; if (y + altoF > H - 14) { doc.addPage(); y = M + 4; }
  y = Math.max(y + 2, H - 14 - altoF); titulo(Z('Firmas', '签字'));
  const fw = (W - 2 * M - 14) / 2;
  [[r.firmaOp, d.opNom, `${Z('Firma operador', '操作员签字')}${d.opEmp ? ' · ' + d.opEmp : ''}`, r.firmaOpTs], [r.firmaEnc, r.encargado, r.cargoEnc ? V(r.cargoEnc) : Z('Vo.Bo. Empresa', '单位审核签字'), r.firmaEncTs]].forEach(([img, nom, cargo, ts], j) => {
    const x = M + j * (fw + 14);
    if (img) doc.addImage(img, img.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + 6, y, fw - 12, 22);
    doc.setDrawColor(60); doc.line(x, y + 24, x + fw, y + 24);
    doc.setFont(FN, 'bold'); doc.setFontSize(9); doc.text(nom || '', x + fw / 2, y + 29, { align: 'center' });
    doc.setFont(FN, 'normal'); doc.setFontSize(8); doc.text(cargo, x + fw / 2, y + 33, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(110); doc.text(img ? (ts ? Z('Firmado', '已签') + ' ' + horaCorta(ts) + (enVentana(r, new Date(ts)) ? '' : ` (${Z('fuera del turno', '班外签字')})`) : Z('Firmado', '已签')) : Z('PENDIENTE DE FIRMA', '待签字'), x + fw / 2, y + 37, { align: 'center' }); doc.setTextColor(20);
  });

  // ---- anexo fotográfico (2 por página, JPEG tal cual quedó guardado)
  const ord = ['HI', 'HF', 'FORM', 'CONS', 'OTRA'];
  const fotos = (await DB.fotos(r.id)).sort((a, b) => ord.indexOf(a.tipo) - ord.indexOf(b.tipo) || a.orden - b.orden);
  o.Fotos = []; const cuenta = {};
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i]; if (i % 2 === 0) { doc.addPage(); y = M; titulo(Z('Anexo fotográfico', '照片附件')); }
    const url = await blobURL(f.blob), [aw, ah] = await new Promise(ok => { const im = new Image(); im.onload = () => ok([im.naturalWidth, im.naturalHeight]); im.src = url; });
    const cw = W - 2 * M, ch = 112, k = Math.min(cw / aw, ch / ah), iw = aw * k, ih = ah * k;
    doc.addImage(url, 'JPEG', M + (cw - iw) / 2, y, iw, ih, 'foto' + i, 'NONE');
    cuenta[f.tipo] = (cuenta[f.tipo] ?? -1) + 1; const arch = nombreFoto(r, f, cuenta[f.tipo]);
    doc.setFont(FN, 'bold'); doc.setFontSize(9); doc.text(`${Z(TIPOS[f.tipo], TIPOS_ZH[f.tipo])} — ${arch}`, W / 2, y + ch + 5, { align: 'center' });
    o.Fotos.push({ Tipo: f.tipo, Archivo: arch, Pagina: doc.getNumberOfPages(), OrdenEnPagina: i % 2 + 1, Ancho: aw, Alto: ah });
    y += ch + 12;
  }

  // ---- datos para la BD (texto plano, una clave por línea)
  doc.addPage(); y = M; titulo(Z('Datos para la BD (lectura automática — no editar)', '数据库数据（自动读取，请勿修改）'));
  doc.setFont('courier', 'normal'); doc.setFontSize(7.6); doc.setTextColor(30);
  const lineas = [PDF_INICIO];
  for (const [k, v] of Object.entries(o)) lineas.push(`${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : (v ?? '')}`.replace(/\s*\n\s*/g, ' / '));
  lineas.push(PDF_FIN);
  for (const l of lineas) {
    doc.setFont(FZ && /[^\u0000-\u00ff]/.test(l) ? FZ : 'courier', 'normal');   // texto chino escrito por el usuario
    for (const [j, t] of cortarCrudo(l, W - 2 * M).entries()) {   // continuación de línea larga: empieza con "  "
    if (y > H - 16) { doc.addPage(); y = M; }
    textoCrudo((j ? '  ' : '') + t, M, y); y += 3.4;
  } }
  const json = JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  doc.setProperties({ title: `Reporte de turno ${o.ID}`, subject: 'DATOS_BD_TELEHANDLER v' + o.VersionFormato, keywords: json, creator: 'App Telehandler v' + APP_V });

  // ---- pie
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont(FN, 'normal'); doc.setFontSize(7.5); doc.setTextColor(130);
    doc.text(`${o.ID} · ${Z('generado', '生成')} ${new Date().toLocaleString('es-CO')} · App v${APP_V}`, M, H - 6);
    doc.text(`${Z('Página', '页')} ${i} / ${n}`, W - M, H - 6, { align: 'right' });
  }
  const blob = doc.output('blob');
  if (!(await entregar(blob, nombrePDF(r), modo))) { msg(B('No se envió. El reporte sigue guardado; puede descargar o compartir el PDF otra vez.', '未发送。报告已保存，可再次下载或分享PDF。')); return; }
  if (modo === 'descargar' && !aviso) msg(B(`PDF descargado: ${nombrePDF(r)} (carpeta Descargas)`, `PDF已下载：${nombrePDF(r)}（「下载」文件夹）`), true);
  // Se marca que el PDF salió (sin cambiar «modificado») para mostrar «PDF generado» en la lista
  r.pdfTs = new Date().toISOString(); const c = { ...r }; delete c._nuevo; delete c._sucio; await DB.put('registros', c);
}

/** El logo SVG convertido a PNG para el encabezado del PDF. */
let _logo;
function logoPNG() {
  if (_logo) return Promise.resolve(_logo);
  return new Promise((ok, ko) => {
    const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#1F2A33'; x.fillRect(0, 0, 160, 160); x.drawImage(im, 0, 0, 160, 160); ok(_logo = c.toDataURL('image/jpeg', .9)); };
    im.onerror = ko; im.src = 'app/logo.svg';
  });
}
