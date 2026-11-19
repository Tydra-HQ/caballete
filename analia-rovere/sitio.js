/* Sitio de Analía Rovere — lee obras y comentarios de Caballete (Supabase) */
(() => {
'use strict';
const SLUG = 'analia-rovere';
const C = window.CABALLETE;
const sb = supabase.createClient(C.url, C.key, { auth: { persistSession: true, detectSessionInUrl: false } });
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const url = (u) => !u ? '' : /^https?:/.test(u) ? u : '../' + u.replace(/^\.?\//, '');
const ORDEN = ['Rostros', 'El cuerpo', 'Árboles y pájaros'];
let artista = null, obras = [], cuentas = {}, filtro = '', actual = -1, visibles = [];

function aviso(t) { const a = $('[data-aviso]'); a.textContent = t; a.hidden = false; clearTimeout(aviso.t); aviso.t = setTimeout(() => { a.hidden = true; }, 3200); }
function ficha(o) {
  const med = o.alto && o.ancho ? `${+o.alto} × ${+o.ancho} cm` : '';
  return [o.tecnica + (o.soporte ? ' sobre ' + o.soporte.toLowerCase() : ''), med, o.anio].filter(Boolean).join(' · ');
}

async function cargar() {
  const ra = await sb.from('artistas').select('id,nombre,slug,instagram').eq('slug', SLUG).maybeSingle();
  if (ra.error || !ra.data) { $('[data-grilla]').innerHTML = '<p class="vacio">No pudimos cargar las obras en este momento.</p>'; return; }
  artista = ra.data;
  const ro = await sb.from('obras_publicas').select('*').eq('artista_id', artista.id).order('creada', { ascending: false });
  obras = ro.data || [];
  const rc = await sb.from('comentarios').select('obra_id').in('obra_id', obras.map((o) => o.id));
  cuentas = {}; (rc.data || []).forEach((c) => { cuentas[c.obra_id] = (cuentas[c.obra_id] || 0) + 1; });
  pintarFiltros(); pintarGrilla();
  const m = location.hash.match(/^#obra-([0-9a-f-]{36})$/); if (m) abrir(m[1]);
}

function pintarFiltros() {
  const temas = ORDEN.filter((t) => obras.some((o) => o.serie === t));
  const caja = $('[data-filtros]');
  caja.innerHTML = [['', 'Todas'], ...temas.map((t) => [t, t])].map(([v, l]) => `<button class="chip" type="button" data-f="${esc(v)}" aria-pressed="${v === filtro}">${esc(l)}</button>`).join('');
  caja.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filtro = b.dataset.f; pintarFiltros(); pintarGrilla(); });
}

function pintarGrilla() {
  visibles = obras.filter((o) => !filtro || o.serie === filtro);
  $('[data-grilla]').innerHTML = visibles.map((o, i) => `<button class="pieza aparece" type="button" data-i="${i}" aria-label="Ver ${esc(o.titulo)}">
      <span class="marco"><img src="${esc(url(o.miniatura_url || o.imagen_url))}" alt="${esc(o.titulo)}" loading="lazy">${cuentas[o.id] ? `<span class="burbuja">💬 ${cuentas[o.id]}</span>` : ''}</span>
      <span class="t"><b>${esc(o.titulo)}</b><span class="tec">${esc(o.tecnica || '')}</span></span></button>`).join('') || '<p class="vacio">Todavía no hay obras en este tema.</p>';
  $('[data-grilla]').querySelectorAll('[data-i]').forEach((b) => b.onclick = () => abrir(visibles[+b.dataset.i].id));
  observar();
}

/* visor */
const visor = $('[data-visor]');
function abrir(id) {
  const i = visibles.findIndex((o) => o.id === id);
  if (i < 0) { filtro = ''; pintarFiltros(); pintarGrilla(); }
  actual = visibles.findIndex((o) => o.id === id);
  if (actual < 0) return;
  mostrar();
  if (!visor.open) visor.showModal();
}
function mostrar() {
  const o = visibles[actual];
  const img = $('[data-v-img]', visor);
  img.src = url(o.imagen_url); img.alt = `${o.titulo}, de Analía Rovere`;
  $('[data-v-tema]', visor).textContent = o.serie || 'Obra';
  $('[data-v-titulo]', visor).textContent = o.titulo;
  $('[data-v-ficha]', visor).textContent = ficha(o);
  history.replaceState(null, '', '#obra-' + o.id);
  $('[data-v-error]', visor).hidden = true;
  cargarComentarios(o.id);
}
async function cargarComentarios(id) {
  const lista = $('[data-v-lista]', visor);
  lista.innerHTML = '<li class="sin-com" style="background:none;padding:0">Cargando…</li>';
  const { data, error } = await sb.from('comentarios').select('id,nombre,texto,creado').eq('obra_id', id).order('creado', { ascending: true });
  if (visibles[actual]?.id !== id) return;
  const n = (data || []).length;
  $('[data-v-cuenta]', visor).textContent = n ? `(${n})` : '';
  lista.innerHTML = error ? '<li class="sin-com" style="background:none;padding:0">No se pudieron cargar los comentarios.</li>'
    : n ? data.map((c) => `<li><b>${esc(c.nombre)}</b><time datetime="${esc(c.creado)}">${new Date(c.creado).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</time><p>${esc(c.texto)}</p></li>`).join('')
    : '<li class="sin-com" style="background:none;padding:0">Todavía nadie comentó esta obra. ¡Sé la primera persona!</li>';
}
function mover(d) { if (!visibles.length) return; actual = (actual + d + visibles.length) % visibles.length; mostrar(); }
$('[data-prev]', visor).onclick = () => mover(-1);
$('[data-next]', visor).onclick = () => mover(1);
$('[data-cerrar]', visor).onclick = () => visor.close();
visor.addEventListener('close', () => history.replaceState(null, '', '#obra'));
visor.addEventListener('click', (e) => { if (e.target === visor) visor.close(); });
visor.addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea')) return;
  if (e.key === 'ArrowLeft') mover(-1); if (e.key === 'ArrowRight') mover(1);
});
let sx = null;
$('.visor-img', visor).addEventListener('pointerdown', (e) => { sx = e.clientX; });
$('.visor-img', visor).addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1); });
$('[data-v-consultar]', visor).onclick = () => {
  const o = visibles[actual]; visor.close();
  const m = $('#c-msg'); if (!m.value.trim()) m.value = `Hola Analía, me encantó «${o.titulo}». `;
};
try { $('#v-nombre').value = localStorage.getItem('ar-nombre') || ''; } catch {}
$('[data-v-form]', visor).onsubmit = async (e) => {
  e.preventDefault();
  const err = $('[data-v-error]', visor); err.hidden = true;
  if ($('[data-trampa]', visor).value) return;
  const nombre = $('#v-nombre').value.trim(), texto = $('#v-texto').value.trim();
  if (!nombre || !texto) { err.hidden = false; err.textContent = 'Escribí tu nombre y tu comentario.'; return; }
  const b = e.submitter; b.disabled = true;
  const o = visibles[actual];
  const { error } = await sb.from('comentarios').insert({ obra_id: o.id, nombre, texto });
  b.disabled = false;
  if (error) { err.hidden = false; err.textContent = 'No se pudo publicar. Probá de nuevo en un momento.'; return; }
  try { localStorage.setItem('ar-nombre', nombre); } catch {}
  $('#v-texto').value = '';
  cuentas[o.id] = (cuentas[o.id] || 0) + 1;
  aviso('¡Gracias! Tu comentario ya está publicado.');
  cargarComentarios(o.id); pintarGrilla();
};

/* temas → filtran la obra */
document.querySelectorAll('[data-tema]').forEach((b) => b.onclick = () => { filtro = b.dataset.tema; pintarFiltros(); pintarGrilla(); $('#obra').scrollIntoView({ behavior: 'smooth' }); });

/* contacto: se guarda como consulta y le llega por email */
$('[data-contacto]').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, err = $('[data-error]', f); err.hidden = true;
  const nombre = f.nombre.value.trim(), email = f.email.value.trim(), mensaje = f.mensaje.value.trim();
  if (!nombre || !/^\S+@\S+\.\S+$/.test(email) || !mensaje) { err.hidden = false; err.textContent = 'Completá tu nombre, un email válido y el mensaje.'; return; }
  if (!artista) { err.hidden = false; err.textContent = 'No se pudo enviar ahora. Probá en un momento.'; return; }
  const b = e.submitter; b.disabled = true;
  const id = crypto.randomUUID();
  const { error } = await sb.from('consultas').insert({ id, artista_id: artista.id, nombre, email, mensaje });
  if (error) { b.disabled = false; err.hidden = false; err.textContent = 'No se pudo enviar. Revisá los datos y probá de nuevo.'; return; }
  sb.functions.invoke('avisar-consulta', { body: { id } }).catch(() => {});
  f.innerHTML = `<div class="gracias"><h3>¡Mensaje enviado!</h3><p style="margin:0">Analía lo recibe por email y te responde a ${esc(email)}.</p></div>`;
};

/* animación de entrada */
let io;
function observar() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { document.querySelectorAll('.aparece').forEach((el) => el.classList.add('visto')); return; }
  io = io || new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.aparece:not(.visto)').forEach((el) => io.observe(el));
}
document.querySelectorAll('.tema, .muestra, .taller, .paleta').forEach((el) => el.classList.add('aparece'));
observar();
cargar();
})();
