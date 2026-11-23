/* Textos bilingües: español · chino simplificado (terminología técnica minera).
 * L('Texto', '文本')  → etiqueta en una línea: «Texto · 文本»
 * B('Texto', '文本')  → mensaje en dos líneas (avisos y toasts)
 * Lm(valor)          → valor del maestro: usa la parte china si viene como «Español / 中文»;
 *                       si no, busca en el glosario genérico; si no hay, deja solo el español. */
'use strict';

const L = (es, zh) => (zh ? `${es} · ${zh}` : es);
const B = (es, zh) => (zh ? `${es}\n${zh}` : es);

/* Glosario genérico de valores típicos del maestro (sin nombres de personas, empresas ni áreas reales). */
const GLOSARIO = {
  'dia': '白班', 'día': '白班', 'noche': '夜班',
  'inoperativo': '故障停机', 'varado': '故障停机', 'mantenimiento preventivo': '预防性维护', 'mantenimiento': '维护保养',
  'mantenimiento correctivo': '故障维修', 'condiciones climaticas': '天气原因', 'lluvia': '降雨', 'otros': '其他', 'otra': '其他', 'otro': '其他',
  'gasolina': '汽油', 'a.c.p.m': '柴油', 'acpm': '柴油', 'diesel': '柴油', 'aceite hidraulico': '液压油', 'aceite motor': '机油',
  'aceite transmision': '变速箱油', 'grasa': '润滑脂', 'refrigerante': '冷却液',
  'telehandler': '伸缩臂叉装车', 'operador telehandler': '伸缩臂叉装车操作员', 'operador': '操作员', 'taller': '维修车间', 'superficie': '地表',
  'horas': '小时', 'gal': '加仑', 'l': '升',
};
function zhDe(valor) {
  const s = String(valor ?? '');
  if (s.includes('/')) { const z = s.split('/').slice(1).join('/').trim(); if (/[一-鿿]/.test(z)) return z; }
  const k = s.split('/')[0].trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
  return GLOSARIO[k] || '';
}
const Lm = valor => { const e = String(valor ?? '').split('/')[0].trim(); const z = zhDe(valor); return z ? `${e} · ${z}` : e; };
