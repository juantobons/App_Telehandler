/* Lectura del maestro en Excel, en el aparato. No se envía a ningún servidor.
 * La hoja trae las tablas lado a lado, separadas por una columna vacía, con encabezados bilingües
 * ("Nombre / 名称"). Cada tabla se reconoce por su primer encabezado (parte en español). */
'use strict';

const Maestro = (() => {
  const es = s => String(s ?? '').split('/')[0].trim();
  const norm = s => es(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const p2 = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

  const TABLAS = {
    personal: ['nombre'],
    turnos: ['turno'],
    equipos: ['equipo'],
    areas: ['area'],
    inactivos: ['tiempos de operacion', 'tiempo inactivo', 'tiempos inactivos', 'causa'],
    calendario: ['dia', 'fecha'],
    consumos: ['consumo', 'consumos del dia'],
    frentes: ['frente', 'frentes', 'frente de trabajo', 'lugar de trabajo', 'lugar'],
  };

  function hora24(txt) {
    const m = String(txt).trim().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
    if (!m) return '';
    let hh = Number(m[1]); const mm = m[2] ? Number(m[2]) : 0; const ap = (m[3] || '').toLowerCase();
    if (ap.startsWith('p') && hh < 12) hh += 12;
    if (ap.startsWith('a') && hh === 12) hh = 0;
    return `${p2(hh)}:${p2(mm)}`;
  }

  function leer(arrayBuffer, nombreArchivo) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const t = {};
    for (const hoja of wb.SheetNames) {
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: '', raw: true });
      const iH = filas.findIndex(f => f.some(c => String(c).trim() !== ''));
      if (iH < 0) continue;
      const enc = filas[iH];
      let col = 0;
      while (col < enc.length) {
        if (String(enc[col]).trim() === '') { col++; continue; }
        const ini = col; while (col < enc.length && String(enc[col]).trim() !== '') col++;
        const clave = Object.keys(TABLAS).find(k => !t[k] && TABLAS[k].includes(norm(enc[ini])));
        if (!clave) continue;
        t[clave] = [];
        for (let r = iH + 1; r < filas.length; r++) {
          const f = (filas[r] || []).slice(ini, col);
          if (String(f[0] ?? '').trim() === '') continue;
          t[clave].push(f.map(v => (typeof v === 'string' ? v.trim() : v)));
        }
      }
    }
    const T = k => t[k] || [];
    const m = {
      archivo: nombreArchivo,
      cargado: new Date().toISOString(),
      personal: T('personal').map(f => ({ id: String(f[1] || f[0]), nombre: f[0], codigo: f[1] || '', cargo: es(f[2] || ''), empresa: f[3] || '' })),
      turnos: T('turnos').map(f => {
        const partes = String(f[1] || '').split(/\s+-\s+|\s*–\s*/);
        return { id: String(f[0]), nombre: f[0], horario: f[1] || '', inicio: hora24(partes[0] || ''), fin: hora24(partes[1] || '') };
      }),
      equipos: T('equipos').map(f => ({ id: String(f[1] || f[0]), nombre: f[0], codigo: f[1] || '', empresa: f[2] || '' })),
      areas: T('areas').map(f => ({ id: String(f[1] || f[0]), nombre: f[0], codigo: f[1] || '', empresa: f[2] || '' })),
      inactivos: T('inactivos').map(f => ({ id: String(f[0]), nombre: f[0], unidad: f[1] || 'Horas' })),
      consumos: T('consumos').map(f => ({ id: String(f[0]), nombre: f[0], unidad: String(f[1] || '').replace(/\s*\/\s*h$/i, '').trim() })),
      frentes: T('frentes').map(f => ({ id: String(f[0]), nombre: f[0], detalle: f[1] || '' })),
      calendario: {},
    };
    for (const f of T('calendario')) {
      let d = f[0];
      if (typeof d === 'number') { const o = XLSX.SSF.parse_date_code(d); d = o ? new Date(o.y, o.m - 1, o.d) : null; }
      else if (typeof d === 'string') d = new Date(d);
      if (!(d instanceof Date) || isNaN(d)) continue;
      m.calendario[iso(d)] = { mes: f[1], semana: f[2] };
    }
    const faltan = ['personal', 'turnos', 'equipos', 'areas'].filter(k => !m[k].length);
    if (faltan.length) throw new Error('No encontré estas tablas en el Excel · Excel中未找到以下表格: ' + faltan.join(', ') +
      '.\nLa primera fila debe tener los encabezados (Nombre, Turno, Equipo, Área…).\n第一行必须是表头（姓名、班次、设备、区域…）。');
    return m;
  }

  return { leer, es, norm };
})();
