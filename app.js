/* Caballete · galería de artistas — PWA sin framework */
(() => {
'use strict';

const C = window.CABALLETE;
const sb = supabase.createClient(C.url, C.key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });
const $app = document.getElementById('app');
const S = { session: null, miArtista: undefined, admin: undefined };

/* ---------- utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const src = (u) => esc(u || '');
const ico = {
  izq: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  der: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  flecha: '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  corazon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  mas: '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:40px;height:40px;fill:none;stroke:#2E4A3E;stroke-width:1.4;stroke-linecap:round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  foto: '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:44px;height:44px;fill:none;stroke:#2E4A3E;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>'
};
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
function mezclar(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function iniciales(n) { return (n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function avatar(a, cls = 'avatar') { return a.avatar_url ? `<img class="${cls}" src="${src(a.avatar_url)}" alt="">` : `<span class="${cls}" aria-hidden="true">${esc(iniciales(a.nombre))}</span>`; }
function ficha(o) {
  const med = o.alto && o.ancho ? `${+o.alto} × ${+o.ancho} cm` : '';
  return [o.tecnica + (o.soporte ? ' sobre ' + o.soporte.toLowerCase() : ''), med, o.anio].filter(Boolean).join(' · ');
}
function etiquetaPrecio(o, precios) {
  if (o.estado === 'vendida') return '<span class="precio vendida">Vendida</span>';
  if (o.estado === 'reservada') return '<span class="precio" style="color:#8A5A12">Reservada</span>';
  if (o.precio_modo === 'mostrar' && precios && precios[o.id] != null) return `<span class="precio">${esc(o.moneda)} ${Number(precios[o.id]).toLocaleString('es-AR')}</span>`;
  if (o.precio_modo === 'consultar') return '<span class="precio">Consultar</span>';
  return '';
}
async function precios(obras) {
  const ids = obras.filter((o) => o.precio_modo === 'mostrar').map((o) => o.id);
  if (!ids.length) return {};
  const { data } = await sb.rpc('precios_visibles', { ids });
  return Object.fromEntries((data || []).map((r) => [r.id, r.precio]));
}
const favs = {
  get() { try { return JSON.parse(localStorage.getItem('cab-favs') || '[]'); } catch { return []; } },
  tiene(id) { return this.get().includes(id); },
  alternar(id) { const f = this.get(); const i = f.indexOf(id); i >= 0 ? f.splice(i, 1) : f.unshift(id); try { localStorage.setItem('cab-favs', JSON.stringify(f)); } catch {} return i < 0; }
};
function pie() {
  return `<footer class="wrap pie-sitio"><b>Caballete</b><span>Las obras pertenecen a sus autores.</span></footer>`;
}
function cargando() { $app.innerHTML = '<p class="cargando">Cargando…</p>'; }
function fallo(e) { console.error(e); $app.innerHTML = `<div class="wrap vacio"><p>No pudimos cargar la galería. Probá de nuevo en un momento.</p><p><a class="btn btn-linea" href="#/">Volver al inicio</a></p></div>`; }

/* ---------- datos ---------- */
async function traerTodo() {
  const [a, o] = await Promise.all([
    sb.from('artistas').select('id,slug,nombre,lineas,avatar_url,activo'),
    sb.from('obras_publicas').select('*').order('creada', { ascending: false })
  ]);
  if (a.error) throw a.error; if (o.error) throw o.error;
  return { artistas: a.data, obras: o.data };
}

/* ---------- carrusel tipo libro ---------- */
function montarFlip(raiz, obras) {
  const caja = raiz.querySelector('.flip');
  const tit = raiz.querySelector('[data-flip-tit]');
  const aut = raiz.querySelector('[data-flip-aut]');
  const n = obras.length;
  let idx = 0, tocado = false, sx = null, swiped = false;
  caja.innerHTML = obras.map((o, i) => `<a class="hoja" href="#/o/${o.id}" data-i="${i}" draggable="false" aria-label="${esc(o.titulo)}, de ${esc(o.artista_nombre)}"><img src="${src(o.miniatura_url || o.imagen_url)}" alt="${esc(o.titulo)}" draggable="false" loading="${i < 4 ? 'eager' : 'lazy'}"></a>`).join('');
  const hojas = [...caja.children];
  function pintar() {
    hojas.forEach((h, i) => {
      let d = i - idx; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
      const a = Math.abs(d), s = Math.sign(d);
      if (a === 0) {
        h.style.transform = 'translate3d(0,0,60px) rotateY(0deg)';
        h.style.boxShadow = '0 2px 4px rgba(31,29,26,.08), 0 30px 60px rgba(31,29,26,.28)';
      } else {
        h.style.transform = `translate3d(calc(var(--k) * ${s * (220 + (a - 1) * 30)}px), 0, ${-80 - (a - 1) * 40}px) rotateY(${-s * 62}deg)`;
        h.style.boxShadow = '0 10px 24px rgba(31,29,26,.18)';
      }
      h.style.zIndex = 50 - a;
      h.style.opacity = a > 5 ? 0 : 1;
      h.style.pointerEvents = a > 5 ? 'none' : '';
      h.tabIndex = a === 0 ? 0 : -1;
      h.dataset.d = d;
    });
    tit.textContent = obras[idx].titulo;
    aut.textContent = obras[idx].artista_nombre;
  }
  const mover = (d) => { idx = (idx + d + n) % n; pintar(); };
  caja.addEventListener('click', (e) => {
    const h = e.target.closest('.hoja'); if (!h) return;
    if (swiped) { e.preventDefault(); return; }
    const d = +h.dataset.d;
    if (d !== 0) { e.preventDefault(); tocado = true; mover(d); }
  });
  caja.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  caja.addEventListener('pointerup', (e) => {
    if (sx === null) return; const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) { swiped = true; setTimeout(() => { swiped = false; }, 80); tocado = true; mover(dx < 0 ? 1 : -1); }
  });
  raiz.querySelector('[data-prev]').onclick = () => { tocado = true; mover(-1); };
  raiz.querySelector('[data-next]').onclick = () => { tocado = true; mover(1); };
  caja.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { tocado = true; mover(-1); } if (e.key === 'ArrowRight') { tocado = true; mover(1); } });
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = setInterval(() => { if (!document.body.contains(caja)) return clearInterval(t); if (!tocado && !quieto && !document.hidden) mover(1); }, 4500);
  pintar();
}

/* ---------- vistas ---------- */
async function vInicio() {
  cargando();
  const { artistas, obras } = await traerTodo();
  // carrusel: obras intercaladas por artista
  const porArt = {}; obras.forEach((o) => (porArt[o.artista_id] ||= []).push(o));
  // si el artista destacó obras, solo esas entran en la portada y el carrusel; si no, todas
  for (const k in porArt) { const d = porArt[k].filter((o) => o.portada); if (d.length) porArt[k] = d; }
  // orden de artistas y de obras al azar en cada visita
  const listas = mezclar(Object.values(porArt).map(mezclar)); const flip = [];
  for (let r = 0; flip.length < 14 && listas.some((l) => l[r]); r++) listas.forEach((l) => { if (l[r] && flip.length < 14) flip.push(l[r]); });
  // una obra de cada artista, en orden aleatorio
  const tarjetas = mezclar(artistas.filter((a) => porArt[a.id])).map((a) => {
    const lista = porArt[a.id];
    const o = lista[Math.floor(Math.random() * lista.length)]; // una obra cualquiera del artista, distinta en cada visita
    return `<a class="tarjeta" href="#/a/${esc(a.slug)}"><div class="marco"><img src="${src(o.miniatura_url || o.imagen_url)}" alt="${esc(o.titulo)}, de ${esc(a.nombre)}" loading="lazy"></div>
      <span class="nom">${esc(a.nombre)}</span>${a.activo === false ? '<span class="oculto">Oculto al público</span>' : ''}<span class="lin">${esc(a.lineas || '')}</span><span class="ver">Ver catálogo ${ico.flecha}</span></a>`;
  }).join('');
  const recientes = obras.slice(0, 8).map(cardMini).join('');
  $app.innerHTML = `
  <section class="wrap hero">
    <div class="hero-txt">
      <span class="ceja">Pintura · Dibujo · Escultura</span>
      <h1>Obras que merecen <em class="it">ser vistas</em> de cerca.</h1>
      <p>Una galería en línea donde cada artista tiene su propio catálogo, y quien ama el arte puede descubrirlo, recorrerlo y contactarlo.</p>
      <div class="hero-btns"><a class="btn btn-negro" href="#artistas">Explorar artistas</a><a class="btn btn-linea" href="#para-artistas">Soy artista</a></div>
    </div>
    <div class="hero-flip" id="flip">
      <div class="flip" role="region" aria-roledescription="carrusel" aria-label="Obras destacadas"></div>
      <div class="flip-pie">
        <button class="redondo" type="button" data-prev aria-label="Obra anterior">${ico.izq}</button>
        <div class="txt" aria-live="polite"><b data-flip-tit></b><span data-flip-aut></span></div>
        <button class="redondo" type="button" data-next aria-label="Obra siguiente">${ico.der}</button>
      </div>
    </div>
  </section>
  <section class="banda seccion" id="artistas"><div class="wrap">
    <div class="sec-cab"><div style="display:flex;flex-direction:column;gap:10px"><span class="ceja sin">Artistas</span><h2>Una obra de cada artista</h2></div>
      <p class="muted" style="margin:0;max-width:400px">Elegí un artista para recorrer su catálogo completo.</p></div>
    <div class="grid-art">${tarjetas}
      <a class="invita" href="#/subir">${ico.mas}<b>Tu obra puede estar acá</b><span>Sumate como artista y armá tu catálogo en minutos.</span></a></div>
  </div></section>
  <section class="wrap seccion" id="recientes">
    <div class="sec-cab"><div style="display:flex;flex-direction:column;gap:10px"><span class="ceja sin">Recién agregadas</span><h2>Obras nuevas en la galería</h2></div><a href="#/obras">Ver todas</a></div>
    <div class="grid-obras">${recientes}</div>
  </section>
  <section class="oscuro seccion" id="para-artistas"><div class="wrap dos">
    <div><img src="img/seed/taller-pinceles.jpg" alt="Pinceles en un taller" style="display:block;width:100%;aspect-ratio:4/5;object-fit:cover" loading="lazy"></div>
    <div style="display:flex;flex-direction:column;gap:28px">
      <span class="ceja">Para artistas</span>
      <h2 style="font-size:clamp(38px,5vw,56px)">Tu taller, abierto al mundo.</h2>
      <p style="margin:0;font-size:18px;line-height:1.65;color:#D8D0C2">Subí fotos de tus obras desde el celular y tené un catálogo propio, prolijo y fácil de compartir. Vos decidís qué mostrar y si publicar precios.</p>
      <ol class="pasos">
        <li><i>I</i><div><b>Subí tus obras</b><span>Foto, título, técnica, medidas y año.</span></div></li>
        <li><i>II</i><div><b>Armá tu catálogo</b><span>Destacá tus mejores obras para que aparezcan en la portada.</span></div></li>
        <li><i>III</i><div><b>Compartí y recibí consultas</b><span>Un link propio para redes, y precios visibles solo si querés.</span></div></li>
      </ol>
      <div><a class="btn btn-claro" href="#/subir">Crear mi catálogo</a></div>
    </div>
  </div></section>${pie()}`;
  if (flip.length) montarFlip(document.getElementById('flip'), flip);
}

function cardMini(o) {
  return `<a class="mini" href="#/o/${o.id}"><div class="marco"><img src="${src(o.miniatura_url || o.imagen_url)}" alt="${esc(o.titulo)}" loading="lazy"></div><b>${esc(o.titulo)}</b><span>${esc(o.artista_nombre)} · ${esc(o.tecnica || '')}</span></a>`;
}

async function vObras() {
  cargando();
  const { obras } = await traerTodo();
  $app.innerHTML = `<section class="wrap seccion"><div class="sec-cab"><h2>Todas las obras</h2><span class="muted">${obras.length} obras</span></div>
    <div class="grid-obras">${obras.map(cardMini).join('')}</div></section>${pie()}`;
}

async function vFavoritas() {
  cargando();
  const ids = favs.get();
  let obras = [];
  if (ids.length) { const r = await sb.from('obras_publicas').select('*').in('id', ids); if (r.error) throw r.error; obras = ids.map((id) => r.data.find((o) => o.id === id)).filter(Boolean); }
  $app.innerHTML = `<section class="wrap seccion"><div class="sec-cab"><h2>Mis favoritas</h2></div>
    ${obras.length ? `<div class="grid-obras">${obras.map(cardMini).join('')}</div>` : '<p class="vacio">Todavía no guardaste obras. Tocá el corazón en una obra para tenerla acá.</p>'}</section>`;
}

async function vArtista(slug) {
  cargando();
  const ra = await sb.from('artistas').select('id,user_id,slug,nombre,lineas,bio,instagram,avatar_url,activo,sitio_url').eq('slug', slug).maybeSingle();
  if (ra.error) throw ra.error;
  if (!ra.data) { $app.innerHTML = '<p class="wrap vacio">No encontramos a este artista.</p>'; return; }
  const a = ra.data;
  const ro = await sb.from('obras_publicas').select('*').eq('artista_id', a.id).order('creada', { ascending: false });
  if (ro.error) throw ro.error;
  const obras = ro.data; const pr = await precios(obras);
  const grupo = (t) => (t || '').split(' sobre ')[0];
  const tecnicas = [...new Set(obras.map((o) => grupo(o.tecnica)).filter(Boolean))];
  document.title = `${a.nombre} · Caballete`;
  $app.innerHTML = `
  <section class="wrap art-cab">
    <div class="txt">
      <a href="#/" style="font-size:14px;text-decoration:none">← Todos los artistas</a>
      ${a.activo === false ? '<p class="aviso-oculto">Este catálogo está <b>oculto al público</b>. Lo ves porque sos administrador/a.</p>' : ''}
      <span class="ceja">Catálogo de artista</span>
      <h1>${esc(a.nombre)}</h1>
      ${a.lineas ? `<p class="muted" style="margin:0;font-size:17px">${esc(a.lineas)}</p>` : ''}
      ${a.bio ? `<p style="margin:0;font-size:18px;line-height:1.65;color:var(--tinta2);max-width:620px">${esc(a.bio)}</p>` : ''}
      <div class="fila-acc">
        ${a.sitio_url ? `<a class="btn btn-verde" href="${esc(a.sitio_url)}">Ir al sitio de ${esc(a.nombre)} →</a>` : ''}
        ${a.instagram ? `<a class="btn btn-linea" href="https://www.instagram.com/${esc(a.instagram)}/" target="_blank" rel="noopener">@${esc(a.instagram)}</a>` : ''}
        <button class="btn btn-negro" type="button" data-consultar>Contactar</button>
        <button class="btn btn-linea" type="button" data-compartir>Compartir</button>
      </div>
    </div>
    ${a.avatar_url ? `<figure><img src="${src(a.avatar_url)}" alt="En el taller de ${esc(a.nombre)}"></figure>` : ''}
  </section>
  <section class="wrap">
    <div class="filtros"><div class="chips" role="group" aria-label="Filtrar obras">
      <button class="chip" type="button" aria-pressed="true" data-f="">Todas</button>
      ${tecnicas.length > 1 ? tecnicas.map((t) => `<button class="chip" type="button" aria-pressed="false" data-f="${esc(t)}">${esc(t)}</button>`).join('') : ''}
    </div><span class="muted" data-cuenta>${obras.length} obras</span></div>
    <div class="masonry">${obras.map((o) => `<a class="obra" href="#/o/${o.id}" data-tec="${esc(grupo(o.tecnica))}"><img src="${src(o.miniatura_url || o.imagen_url)}" alt="${esc(o.titulo)}" loading="lazy"><div class="pie"><div><b>${esc(o.titulo)}</b><small>${esc(ficha(o))}</small></div>${etiquetaPrecio(o, pr)}</div></a>`).join('') || '<p class="vacio">Todavía no hay obras publicadas.</p>'}</div>
  </section>${pie()}`;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => {
    $app.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    let c = 0; $app.querySelectorAll('.obra').forEach((o) => { const v = !b.dataset.f || o.dataset.tec === b.dataset.f; o.style.display = v ? '' : 'none'; c += v; });
    $app.querySelector('[data-cuenta]').textContent = `${c} ${c === 1 ? 'obra' : 'obras'}`;
  });
  $app.querySelector('[data-consultar]').onclick = () => dlgConsulta(a, null);
  $app.querySelector('[data-compartir]').onclick = () => compartir(`${a.nombre} en Caballete`, location.href);
}

async function vObra(id) {
  cargando();
  const r = await sb.from('obras_publicas').select('*').eq('id', id).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) { $app.innerHTML = '<p class="wrap vacio">Esta obra ya no está disponible.</p>'; return; }
  const o = r.data;
  const [ra, rm, pr] = await Promise.all([
    sb.from('artistas').select('id,slug,nombre,avatar_url').eq('id', o.artista_id).single(),
    sb.from('obras_publicas').select('id,titulo,imagen_url,miniatura_url').eq('artista_id', o.artista_id).neq('id', o.id).limit(6),
    precios([o])
  ]);
  const a = ra.data;
  const med = o.alto && o.ancho ? `${+o.alto} × ${+o.ancho} cm` : '—';
  document.title = `${o.titulo} · ${a.nombre} · Caballete`;
  $app.innerHTML = `
  <section class="wrap det">
    <div class="det-img"><img src="${src(o.imagen_url)}" alt="${esc(o.titulo)}, de ${esc(a.nombre)}"></div>
    <div class="det-txt">
      <a href="#/a/${esc(a.slug)}" style="font-size:14px;text-decoration:none">← Catálogo de ${esc(a.nombre)}</a>
      <h1>${esc(o.titulo)}</h1>
      <a class="quien" href="#/a/${esc(a.slug)}">${avatar(a)}${esc(a.nombre)}</a>
      <dl class="ficha"><div><dt>Técnica</dt><dd>${esc(o.tecnica || '—')}${o.soporte ? ' sobre ' + esc(o.soporte.toLowerCase()) : ''}</dd></div><div><dt>Medidas</dt><dd>${esc(med)}</dd></div><div><dt>Año</dt><dd>${esc(o.anio || '—')}</dd></div></dl>
      ${o.descripcion ? `<p style="margin:0;line-height:1.65;color:var(--tinta2)">${esc(o.descripcion)}</p>` : ''}
      <div>${etiquetaPrecio(o, pr)}</div>
      <div class="fila-acc">
        ${o.estado !== 'vendida' ? '<button class="btn btn-verde" type="button" data-consultar>Consultar por esta obra</button>' : ''}
        <button class="corazon" type="button" data-fav aria-pressed="${favs.tiene(o.id)}" aria-label="Guardar en favoritas">${ico.corazon}</button>
        <button class="btn btn-linea" type="button" data-compartir>Compartir</button>
      </div>
      ${rm.data && rm.data.length ? `<h2 style="font-size:26px;margin-top:18px">Más de ${esc(a.nombre.split(' ')[0])}</h2>
      <div class="grid-obras" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">${rm.data.map((x) => `<a class="mini" href="#/o/${x.id}"><div class="marco" style="padding:5px"><img src="${src(x.miniatura_url || x.imagen_url)}" alt="${esc(x.titulo)}" loading="lazy"></div></a>`).join('')}</div>` : ''}
    </div>
  </section>`;
  const bc = $app.querySelector('[data-consultar]'); if (bc) bc.onclick = () => dlgConsulta(a, o);
  $app.querySelector('[data-fav]').onclick = (e) => { const on = favs.alternar(o.id); e.currentTarget.setAttribute('aria-pressed', on); toast(on ? 'Guardada en favoritas' : 'Quitada de favoritas'); };
  $app.querySelector('[data-compartir]').onclick = () => compartir(`${o.titulo}, de ${a.nombre}`, location.href);
}

function compartir(titulo, url) {
  if (navigator.share) navigator.share({ title: titulo, url }).catch(() => {});
  else navigator.clipboard.writeText(url).then(() => toast('Link copiado'), () => toast(url));
}

function dlgConsulta(a, o) {
  const d = document.createElement('dialog');
  const msg = o ? `Hola ${a.nombre.split(' ')[0]}, me interesa «${o.titulo}». ¿Está disponible?` : `Hola ${a.nombre.split(' ')[0]}, `;
  d.innerHTML = `<form class="dlg" method="dialog">
    <h2 style="font-size:30px">Escribile a ${esc(a.nombre.split(' ')[0])}</h2>
    <div class="f"><label class="l" for="cn">Tu nombre</label><input class="campo" id="cn" required maxlength="120" autocomplete="name"></div>
    <div class="f"><label class="l" for="ce">Tu email</label><input class="campo" id="ce" type="email" required maxlength="200" autocomplete="email"></div>
    <div class="f"><label class="l" for="cm">Mensaje</label><textarea class="campo" id="cm" rows="4" required maxlength="2000">${esc(msg)}</textarea></div>
    <p class="error" data-err hidden></p>
    <div class="acciones"><button class="btn btn-linea" type="button" data-cerrar>Cancelar</button><button class="btn btn-verde" type="submit">Enviar consulta</button></div>
  </form>`;
  document.body.appendChild(d); d.showModal();
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-cerrar]').onclick = () => d.close();
  d.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter; b.disabled = true;
    const cid = crypto.randomUUID();
    const { error } = await sb.from('consultas').insert({ id: cid, artista_id: a.id, obra_id: o ? o.id : null, nombre: d.querySelector('#cn').value.trim(), email: d.querySelector('#ce').value.trim(), mensaje: d.querySelector('#cm').value.trim() });
    if (error) { b.disabled = false; const p = d.querySelector('[data-err]'); p.hidden = false; p.textContent = 'No se pudo enviar. Revisá los datos y probá de nuevo.'; return; }
    sb.functions.invoke('avisar-consulta', { body: { id: cid } }).catch(() => {});
    d.querySelector('form').innerHTML = `<div class="ok" style="padding:24px 0"><h2 style="font-size:30px">Consulta enviada</h2><p class="muted" style="margin:0">${esc(a.nombre)} la va a ver en su taller.</p><button class="btn btn-linea" type="button" onclick="this.closest('dialog').close()">Listo</button></div>`;
  };
}

/* ---------- cuenta del artista ---------- */
async function miArtista() {
  if (!S.session) return null;
  if (S.miArtista !== undefined) return S.miArtista;
  const { data: id } = await sb.rpc('vincular_artista');
  if (!id) { S.miArtista = null; return null; }
  const { data } = await sb.from('artistas').select('id,user_id,slug,nombre,lineas,bio,instagram,avatar_url,activo').eq('id', id).single();
  S.miArtista = data; return data;
}

function vEntrar(destino) {
  $app.innerHTML = `<section class="wrap form-wrap" style="max-width:520px">
    <span class="ceja">Para artistas</span>
    <h1 style="font-size:52px">Entrá a tu taller</h1>
    <p class="muted" style="margin:0">Te mandamos un link a tu email para entrar, sin contraseña.</p>
    <form class="caja" data-form>
      <div class="f"><label class="l" for="em">Tu email</label><input class="campo" id="em" type="email" required autocomplete="email"></div>
      <button class="btn btn-verde" type="submit">Enviarme el link</button>
      <p class="error" data-err hidden></p>
    </form></section>`;
  $app.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    try { sessionStorage.setItem('cab-destino', destino || '#/mi'); } catch {}
    const email = $app.querySelector('#em').value.trim();
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) { b.disabled = false; const p = $app.querySelector('[data-err]'); p.hidden = false; p.textContent = error.status === 429 ? 'Se mandaron demasiados emails. Esperá unos minutos y probá de nuevo.' : 'No pudimos mandar el email. Revisá la dirección.'; return; }
    $app.querySelector('[data-form]').innerHTML = `<h2 style="font-size:30px">Revisá tu correo</h2><p style="margin:0">Te mandamos un link a <b>${esc(email)}</b>. Abrilo desde este mismo dispositivo y navegador.</p>`;
  };
}

function vAlta() {
  $app.innerHTML = `<section class="wrap form-wrap" style="max-width:620px">
    <span class="ceja">Bienvenida</span>
    <h1 style="font-size:52px">Armá tu perfil de artista</h1>
    <form class="caja" data-form>
      <div class="f"><label class="l" for="nm">Nombre artístico</label><input class="campo" id="nm" required maxlength="80"></div>
      <div class="f"><label class="l" for="sl">Tu dirección en Caballete</label><input class="campo" id="sl" required pattern="[a-z0-9\\-]{2,60}" maxlength="60"><span class="ayuda" data-url></span></div>
      <div class="f"><label class="l" for="ln">Técnicas y temas</label><input class="campo" id="ln" maxlength="80" placeholder="Ej.: Óleo y acuarela · Paisaje"></div>
      <div class="f"><label class="l" for="ig">Instagram (opcional)</label><input class="campo" id="ig" maxlength="60" placeholder="usuario, sin @"></div>
      <div class="f"><label class="l" for="bi">Sobre vos (opcional)</label><textarea class="campo" id="bi" rows="4" maxlength="1500"></textarea></div>
      <p class="error" data-err hidden></p>
      <div class="acciones"><button class="btn btn-verde" type="submit">Crear mi perfil</button></div>
    </form></section>`;
  const nm = $app.querySelector('#nm'), sl = $app.querySelector('#sl'), u = $app.querySelector('[data-url]');
  let tocado = false;
  const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const verUrl = () => { u.textContent = `${location.origin}${location.pathname}#/a/${sl.value || '…'}`; };
  nm.oninput = () => { if (!tocado) sl.value = slugify(nm.value); verUrl(); };
  sl.oninput = () => { tocado = true; sl.value = slugify(sl.value); verUrl(); }; verUrl();
  $app.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    const fila = { user_id: S.session.user.id, email: S.session.user.email, nombre: nm.value.trim(), slug: sl.value, lineas: $app.querySelector('#ln').value.trim() || null, instagram: $app.querySelector('#ig').value.trim().replace(/^@/, '') || null, bio: $app.querySelector('#bi').value.trim() || null };
    const { error } = await sb.from('artistas').insert(fila);
    if (error) { b.disabled = false; const p = $app.querySelector('[data-err]'); p.hidden = false; p.textContent = error.code === '23505' ? 'Esa dirección ya está tomada. Probá con otra.' : 'No se pudo crear el perfil.'; return; }
    S.miArtista = undefined; await miArtista(); toast('¡Perfil creado!'); location.hash = '#/subir';
  };
}

async function esAdmin() {
  if (!S.session) return false;
  if (S.admin === undefined) { const { data } = await sb.rpc('es_admin'); S.admin = data === true; }
  return S.admin;
}
function htmlAdmin() {
  return `<div class="caja" data-admin><h2>Administración</h2>
    <p class="muted" style="margin:0">Los artistas ocultos no aparecen para el público: solo los ven los administradores.</p>
    <div data-admin-lista><p class="muted" style="margin:0">Cargando artistas…</p></div></div>`;
}
async function montarAdmin() {
  const caja = $app.querySelector('[data-admin-lista]'); if (!caja) return;
  const { data, error } = await sb.from('artistas').select('id,slug,nombre,activo').order('nombre');
  if (error) { caja.innerHTML = '<p class="error">No se pudo cargar la lista.</p>'; return; }
  caja.innerHTML = data.map((a) => `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--linea);padding:12px 0">
      <a href="#/a/${esc(a.slug)}" style="font-family:var(--serif);font-size:22px;text-decoration:none;color:var(--tinta)">${esc(a.nombre)}</a>
      <button class="chip" type="button" data-activo="${a.id}" aria-pressed="${a.activo}">${a.activo ? '● Visible al público' : '○ Oculto'}</button></div>`).join('');
  caja.querySelectorAll('[data-activo]').forEach((b) => b.onclick = async () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    const nombre = b.parentElement.querySelector('a').textContent;
    if (!confirm(on ? `¿Mostrar a ${nombre} al público?` : `¿Ocultar a ${nombre} del público?`)) return;
    b.disabled = true;
    const { error } = await sb.from('artistas').update({ activo: on }).eq('id', b.dataset.activo);
    b.disabled = false;
    if (error) return toast('No se pudo cambiar');
    b.setAttribute('aria-pressed', on); b.textContent = on ? '● Visible al público' : '○ Oculto';
    toast(on ? `${nombre} ya es visible para todos` : `${nombre} quedó oculto al público`);
  });
}

async function montarComentarios(obras) {
  const caja = $app.querySelector('[data-coms]'); if (!caja) return;
  const ids = obras.map((o) => o.id);
  if (!ids.length) { caja.innerHTML = '<p class="muted" style="margin:0">Todavía no hay comentarios.</p>'; return; }
  const { data, error } = await sb.from('comentarios').select('id,obra_id,nombre,texto,oculto,creado').in('obra_id', ids).order('creado', { ascending: false }).limit(100);
  if (error) { caja.innerHTML = '<p class="error">No se pudieron cargar.</p>'; return; }
  const tit = Object.fromEntries(obras.map((o) => [o.id, o.titulo]));
  caja.innerHTML = data.length ? data.map((c) => `<div style="border-top:1px solid var(--linea);padding:12px 0;display:flex;flex-direction:column;gap:4px;${c.oculto ? 'opacity:.55' : ''}">
      <b>${esc(c.nombre)} <span class="muted" style="font-weight:400;font-size:13px">sobre «${esc(tit[c.obra_id] || '')}» · ${new Date(c.creado).toLocaleDateString('es-AR')}</span></b>
      <p style="margin:0;white-space:pre-line">${esc(c.texto)}</p>
      <div class="fila-acc"><button class="chip" type="button" data-ocultar="${c.id}" aria-pressed="${c.oculto}" style="min-height:40px">${c.oculto ? 'Volver a mostrar' : 'Ocultar'}</button>
      <button class="chip" type="button" data-borrar-com="${c.id}" style="min-height:40px;color:var(--rojo)">Borrar</button></div></div>`).join('')
    : '<p class="muted" style="margin:0">Todavía no hay comentarios.</p>';
  caja.querySelectorAll('[data-ocultar]').forEach((b) => b.onclick = async () => {
    const oc = b.getAttribute('aria-pressed') !== 'true';
    const { error } = await sb.from('comentarios').update({ oculto: oc }).eq('id', b.dataset.ocultar);
    if (error) return toast('No se pudo cambiar'); toast(oc ? 'Comentario oculto' : 'Comentario visible'); montarComentarios(obras);
  });
  caja.querySelectorAll('[data-borrar-com]').forEach((b) => b.onclick = async () => {
    if (!confirm('¿Borrar este comentario? No se puede deshacer.')) return;
    const { error } = await sb.from('comentarios').delete().eq('id', b.dataset.borrarCom);
    if (error) return toast('No se pudo borrar'); toast('Comentario borrado'); montarComentarios(obras);
  });
}

async function vMi() {
  if (!S.session) return vEntrar('#/mi');
  cargando();
  const [a, admin] = await Promise.all([miArtista(), esAdmin()]);
  if (!a && admin) {
    $app.innerHTML = `<section class="wrap form-wrap" style="max-width:960px">
      <span class="ceja">Administración</span><h1 style="font-size:52px">Caballete</h1>
      ${htmlAdmin()}
      <p class="muted" style="margin:0">Si además querés publicar obras propias, <a href="#/mi" data-alta>creá tu perfil de artista</a>.</p>
      <div><button class="btn btn-linea" type="button" data-salir>Cerrar sesión</button></div></section>`;
    $app.querySelector('[data-alta]').onclick = (e) => { e.preventDefault(); vAlta(); };
    $app.querySelector('[data-salir]').onclick = async () => { await sb.auth.signOut(); S.miArtista = undefined; S.admin = undefined; location.hash = '#/'; };
    return montarAdmin();
  }
  if (!a) return vAlta();
  const [ro, rc, rp] = await Promise.all([
    sb.from('obras').select('id,titulo,tecnica,imagen_url,miniatura_url,publicada,estado,precio_modo,moneda,portada,creada').eq('artista_id', a.id).order('creada', { ascending: false }),
    sb.from('consultas').select('*').eq('artista_id', a.id).order('creada', { ascending: false }).limit(50),
    sb.rpc('mis_precios')
  ]);
  const obras = ro.data || [], cons = rc.data || [];
  const titulos = Object.fromEntries(obras.map((o) => [o.id, o.titulo]));
  $app.innerHTML = `<section class="wrap form-wrap" style="max-width:960px">
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:16px">
      <div style="display:flex;flex-direction:column;gap:8px"><span class="ceja">Mi taller</span><h1 style="font-size:52px">${esc(a.nombre)}</h1></div>
      <div class="fila-acc"><a class="btn btn-linea" href="#/a/${esc(a.slug)}">Ver mi catálogo</a><a class="btn btn-verde" href="#/subir">Subir obra</a></div>
    </div>
    <div class="caja"><h2>Consultas recibidas <span class="muted" style="font-weight:400;font-size:15px">(${cons.length})</span></h2>
      ${cons.length ? cons.map((c) => `<div style="border-top:1px solid var(--linea);padding-top:14px;display:flex;flex-direction:column;gap:4px">
        <b>${esc(c.nombre)} · <a href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Tu consulta en Caballete')}">${esc(c.email)}</a></b>
        <span class="muted" style="font-size:13px">${new Date(c.creada).toLocaleString('es-AR')}${c.obra_id && titulos[c.obra_id] ? ' · por «' + esc(titulos[c.obra_id]) + '»' : ''}</span>
        <p style="margin:4px 0 0;white-space:pre-line">${esc(c.mensaje)}</p></div>`).join('') : '<p class="muted" style="margin:0">Todavía no recibiste consultas.</p>'}
    </div>
    <div class="caja"><h2>Mis obras <span class="muted" style="font-weight:400;font-size:15px">(${obras.length})</span></h2>
      ${obras.length ? `<div class="grid-obras" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px">${obras.map((o) => `<div class="mini"><a class="marco" href="#/o/${o.id}" style="padding:6px"><img src="${src(o.miniatura_url || o.imagen_url)}" alt="${esc(o.titulo)}"></a><b style="font-size:18px">${esc(o.titulo)}</b><span>${esc(o.estado)}</span><button class="chip" type="button" data-destacar="${o.id}" aria-pressed="${!!o.portada}" style="min-height:40px">${o.portada ? '★ Destacada' : '☆ Destacar'}</button><button class="btn btn-linea" type="button" data-borrar="${o.id}" style="min-height:40px;padding:0 12px;font-size:13px;color:var(--rojo);border-color:var(--borde)">Quitar</button></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Todavía no subiste obras.</p>'}
    </div>
    <div class="caja"><h2>Comentarios en tus obras</h2><div data-coms><p class="muted" style="margin:0">Cargando…</p></div></div>
    ${admin ? htmlAdmin() : ''}
    <div><button class="btn btn-linea" type="button" data-salir>Cerrar sesión</button></div>
  </section>`;
  if (admin) montarAdmin();
  montarComentarios(obras);
  $app.querySelectorAll('[data-borrar]').forEach((b) => b.onclick = async () => {
    if (!confirm('¿Quitar esta obra de tu catálogo? No se puede deshacer.')) return;
    const { error } = await sb.from('obras').delete().eq('id', b.dataset.borrar);
    if (error) return toast('No se pudo quitar'); toast('Obra quitada'); vMi();
  });
  $app.querySelectorAll('[data-destacar]').forEach((b) => b.onclick = async () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.disabled = true;
    const { error } = await sb.from('obras').update({ portada: on }).eq('id', b.dataset.destacar);
    b.disabled = false;
    if (error) return toast('No se pudo cambiar');
    b.setAttribute('aria-pressed', on); b.textContent = on ? '★ Destacada' : '☆ Destacar';
    toast(on ? 'Obra destacada: aparece en la portada' : 'Ya no está destacada');
  });
  $app.querySelector('[data-salir]').onclick = async () => { await sb.auth.signOut(); S.miArtista = undefined; S.admin = undefined; location.hash = '#/'; };
}

/* ---------- subir obra ---------- */
async function comprimir(file, max, q) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  let w, h, dibujar;
  if (bmp) { w = bmp.width; h = bmp.height; dibujar = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H); }
  else {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); });
    w = img.naturalWidth; h = img.naturalHeight; dibujar = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
  }
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  dibujar(c.getContext('2d'), c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
}

async function vSubir() {
  if (!S.session) return vEntrar('#/subir');
  cargando();
  const a = await miArtista();
  if (!a) return vAlta();
  const st = { file: null, url: null, modo: 'consultar', estado: 'disponible' };
  $app.innerHTML = `<section class="wrap form-wrap">
    <a href="#/mi" style="font-size:14px;text-decoration:none">← Mi taller</a>
    <h1 style="font-size:clamp(40px,6vw,56px)">Subir una obra</h1>
    <p class="muted" style="margin:0">Solo la foto y el título son obligatorios.</p>
    <form data-form style="display:flex;flex-direction:column;gap:24px">
      <div class="caja"><h2><i>I</i>Foto de la obra</h2>
        <div data-foto></div>
        <input type="file" accept="image/*" id="archivo" hidden>
        <div class="aviso">Para que luzca: luz natural de día, de frente, sin marco ni vidrio, y que la obra ocupe toda la foto.</div>
      </div>
      <div class="caja"><h2><i>II</i>Datos de la obra</h2>
        <div class="f"><label class="l" for="ti">Título</label><input class="campo" id="ti" required maxlength="120"></div>
        <div class="g2">
          <div class="f"><label class="l" for="te">Técnica</label><select class="campo" id="te"><option>Óleo</option><option>Acrílico</option><option>Pastel</option><option>Acuarela</option><option>Dibujo</option><option>Grabado</option><option>Técnica mixta</option><option>Escultura</option><option>Otra</option></select></div>
          <div class="f"><label class="l" for="so">Soporte o material</label><input class="campo" id="so" maxlength="60" placeholder="Tela, papel, madera, bronce…"></div>
        </div>
        <div class="g3">
          <div class="f"><label class="l" for="al">Alto (cm)</label><input class="campo" id="al" type="number" inputmode="decimal" min="0" step="0.1"></div>
          <div class="f"><label class="l" for="an">Ancho (cm)</label><input class="campo" id="an" type="number" inputmode="decimal" min="0" step="0.1"></div>
          <div class="f"><label class="l" for="yy">Año</label><input class="campo" id="yy" type="number" inputmode="numeric" min="1900" max="2100"></div>
        </div>
        <div class="f"><label class="l" for="de">Sobre la obra (opcional)</label><textarea class="campo" id="de" rows="3" maxlength="1500"></textarea></div>
      </div>
      <div class="caja"><h2><i>III</i>Precio y disponibilidad</h2>
        <span class="l" id="pm">¿Mostrar el precio?</span>
        <div class="seg" role="group" aria-labelledby="pm" data-seg="modo"><button type="button" data-v="mostrar">Mostrar</button><button type="button" data-v="consultar">A consultar</button><button type="button" data-v="ocultar">No mostrar</button></div>
        <div class="g2" data-precio hidden><div class="f"><label class="l" for="mo">Moneda</label><select class="campo" id="mo"><option>ARS</option><option>USD</option></select></div><div class="f"><label class="l" for="pr">Precio</label><input class="campo" id="pr" type="number" inputmode="numeric" min="0"></div></div>
        <span class="l" id="es">Estado</span>
        <div class="seg" role="group" aria-labelledby="es" data-seg="estado"><button type="button" data-v="disponible">Disponible</button><button type="button" data-v="reservada">Reservada</button><button type="button" data-v="vendida">Vendida</button></div>
        <label class="check"><input type="checkbox" id="po"> Destacar esta obra</label>
        <span class="ayuda" style="margin-top:-10px">Las obras destacadas son las que aparecen en la portada de la galería y en el carrusel. Si no destacás ninguna, se elige al azar entre todas.</span>
      </div>
      <p class="error" data-err hidden></p>
      <div class="acciones"><button class="btn btn-verde" type="submit" data-pub>Publicar obra</button></div>
    </form></section>`;
  const $f = $app.querySelector('[data-foto]'), $in = $app.querySelector('#archivo');
  const pintarFoto = () => {
    $f.innerHTML = st.url
      ? `<div class="prev-foto"><img src="${st.url}" alt="Vista previa de la foto"><button class="btn btn-linea quitar" type="button" data-q style="background:var(--papel)">Cambiar</button></div>`
      : `<div class="zona" role="button" tabindex="0" data-z>${ico.foto}<b style="font-size:18px;color:var(--tinta)">Elegí o sacá la foto de tu obra</b><span class="ayuda">JPG o PNG. La achicamos automáticamente para que cargue rápido.</span></div>`;
    const z = $f.querySelector('[data-z]'), q = $f.querySelector('[data-q]');
    if (z) {
      z.onclick = () => $in.click(); z.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $in.click(); } };
      z.ondragover = (e) => { e.preventDefault(); z.classList.add('arrastre'); }; z.ondragleave = () => z.classList.remove('arrastre');
      z.ondrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) elegir(f); };
    }
    if (q) q.onclick = () => $in.click();
  };
  const elegir = (f) => { if (!f.type.startsWith('image/')) return toast('Ese archivo no es una imagen'); if (st.url) URL.revokeObjectURL(st.url); st.file = f; st.url = URL.createObjectURL(f); pintarFoto(); };
  $in.onchange = () => { if ($in.files[0]) elegir($in.files[0]); $in.value = ''; };
  pintarFoto();
  $app.querySelectorAll('[data-seg]').forEach((g) => {
    const k = g.dataset.seg;
    const marcar = () => { g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st[k])); if (k === 'modo') $app.querySelector('[data-precio]').hidden = st.modo !== 'mostrar'; };
    g.onclick = (e) => { const b = e.target.closest('button'); if (b) { st[k] = b.dataset.v; marcar(); } }; marcar();
  });
  $app.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    const err = $app.querySelector('[data-err]'); err.hidden = true;
    if (!st.file) { err.hidden = false; err.textContent = 'Falta la foto de la obra.'; return; }
    const b = $app.querySelector('[data-pub]'); b.disabled = true; b.textContent = 'Subiendo…';
    try {
      const [grande, chica] = await Promise.all([comprimir(st.file, 1800, 0.84), comprimir(st.file, 700, 0.8)]);
      const base = `${S.session.user.id}/${crypto.randomUUID()}`;
      const up1 = await sb.storage.from(C.bucket).upload(base + '.jpg', grande, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (up1.error) throw up1.error;
      const up2 = await sb.storage.from(C.bucket).upload(base + '_m.jpg', chica, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (up2.error) throw up2.error;
      const pub = (p) => sb.storage.from(C.bucket).getPublicUrl(p).data.publicUrl;
      const v = (id) => $app.querySelector(id).value.trim();
      const portada = $app.querySelector('#po').checked;
      const fila = {
        artista_id: a.id, titulo: v('#ti'), tecnica: v('#te'), soporte: v('#so') || null,
        alto: v('#al') ? +v('#al') : null, ancho: v('#an') ? +v('#an') : null, anio: v('#yy') ? +v('#yy') : null,
        descripcion: v('#de') || null, imagen_url: pub(base + '.jpg'), miniatura_url: pub(base + '_m.jpg'),
        precio_modo: st.modo, precio: st.modo === 'mostrar' && v('#pr') ? +v('#pr') : null, moneda: v('#mo'), estado: st.estado, portada
      };
      const ins = await sb.from('obras').insert(fila).select('id').single();
      if (ins.error) throw ins.error;
      $app.innerHTML = `<section class="wrap ok"><img src="${st.url}" alt="" style="width:200px;height:260px;object-fit:cover;background:var(--papel);padding:8px;box-shadow:0 20px 40px rgba(31,29,26,.2)">
        <h1 style="font-size:44px">¡Tu obra ya está en la galería!</h1><p class="muted" style="margin:0">«${esc(fila.titulo)}» se sumó a tu catálogo.</p>
        <div class="fila-acc" style="justify-content:center"><a class="btn btn-verde" href="#/o/${ins.data.id}">Ver la obra</a><a class="btn btn-linea" href="#/subir" onclick="setTimeout(()=>dispatchEvent(new HashChangeEvent('hashchange')),0)">Subir otra</a></div></section>`;
    } catch (ex) {
      console.error(ex); b.disabled = false; b.textContent = 'Publicar obra';
      err.hidden = false; err.textContent = 'No se pudo subir la obra. Revisá tu conexión y probá de nuevo.';
    }
  };
}

/* ---------- router ---------- */
const rutas = [
  [/^#?\/?$/, vInicio, 'inicio'],
  [/^#\/obras$/, vObras, 'obras'],
  [/^#\/favoritas$/, vFavoritas, 'favoritas'],
  [/^#\/a\/([a-z0-9-]+)$/, vArtista, 'inicio'],
  [/^#\/o\/([0-9a-f-]{36})$/, vObra, 'obras'],
  [/^#\/mi$/, vMi, 'mi'],
  [/^#\/subir$/, vSubir, 'subir']
];
async function router() {
  const h = location.hash;
  if (/^#[a-z-]+$/.test(h) && h !== '#') { // anclas dentro de la home
    const el = document.getElementById(h.slice(1));
    if (el) { el.scrollIntoView({ behavior: 'smooth' }); return; }
    if (['#artistas', '#recientes', '#para-artistas'].includes(h)) { await vInicio().catch(fallo); document.getElementById(h.slice(1))?.scrollIntoView(); return; }
  }
  const r = rutas.find(([re]) => re.test(h || '#/')) || rutas[0];
  const m = (h || '#/').match(r[0]);
  document.title = 'Caballete · galería de artistas';
  document.querySelectorAll('[data-nav]').forEach((a) => { if (a.dataset.nav === r[2]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  try { await r[1](m[1]); } catch (e) { fallo(e); }
}

function navSesion() { document.getElementById('nav-mi').textContent = S.session ? 'Mi taller' : 'Entrar'; }

(async () => {
  const { data } = await sb.auth.getSession();
  S.session = data.session; navSesion();
  if (new URLSearchParams(location.search).has('code') || location.search.includes('error')) {
    history.replaceState(null, '', location.pathname + (sessionStorage.getItem('cab-destino') || '#/mi'));
  }
  sb.auth.onAuthStateChange((_ev, ses) => { const antes = !!S.session; S.session = ses; if (!ses) { S.miArtista = undefined; S.admin = undefined; } navSesion(); if (antes !== !!ses && /^#\/(mi|subir)$/.test(location.hash)) router(); });
  addEventListener('hashchange', router);
  router();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
