// Avisa por email al artista cuando llega una consulta nueva.
// Proveedor: Resend (RESEND_API_KEY) o Brevo (BREVO_API_KEY). Remitente: MAIL_FROM (+ MAIL_FROM_NAME).
// Si el artista no tiene email de avisos, va a ADMIN_EMAIL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SITIO = Deno.env.get('SITE_URL') ?? 'https://caballete.com.ar/';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let id = '';
  try { id = (await req.json()).id; } catch { return json({ error: 'body' }, 400); }
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) return json({ error: 'id' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  // Marca como avisada en el mismo paso, así una consulta nunca genera dos emails.
  const { data: c, error } = await sb.from('consultas').update({ avisada: true })
    .eq('id', id).eq('avisada', false).gte('creada', desde)
    .select('id,nombre,email,mensaje,obra_id,artista_id').maybeSingle();
  if (error) return json({ error: 'db' }, 500);
  if (!c) return json({ ok: true, skipped: true });

  const { data: a } = await sb.from('artistas').select('nombre,slug,email_avisos,email').eq('id', c.artista_id).single();
  let obra: { titulo: string } | null = null;
  if (c.obra_id) obra = (await sb.from('obras').select('titulo').eq('id', c.obra_id).maybeSingle()).data;
  const para = a?.email_avisos || a?.email || Deno.env.get('ADMIN_EMAIL');
  if (!para) return json({ ok: false, reason: 'sin destinatario' });

  const asunto = obra ? `Consulta por «${obra.titulo}» en Caballete` : 'Nueva consulta en Caballete';
  const html = `<div style="font-family:Georgia,serif;color:#1F1D1A;max-width:560px">
    <h2 style="font-weight:500">Hola ${esc(a?.nombre ?? '')}, te escribieron desde Caballete</h2>
    ${obra ? `<p>Por la obra <i>${esc(obra.titulo)}</i>.</p>` : ''}
    <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;background:#F5F1EA;padding:16px;white-space:pre-line">${esc(c.mensaje)}</p>
    <p style="font-family:Arial,sans-serif;font-size:15px"><b>${esc(c.nombre)}</b> · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6358">Para responder, contestá este email: le llega directamente a ${esc(c.nombre)}.</p>
    <p style="font-family:Arial,sans-serif;font-size:14px"><a href="${SITIO}#/a/${esc(a?.slug ?? '')}" style="color:#2E4A3E">Ver tu catálogo</a></p></div>`;
  const texto = `${obra ? 'Consulta por «' + obra.titulo + '»\n\n' : ''}${c.mensaje}\n\n${c.nombre} <${c.email}>`;
  const from = Deno.env.get('MAIL_FROM');
  const fromName = Deno.env.get('MAIL_FROM_NAME') ?? 'Caballete';
  const resend = Deno.env.get('RESEND_API_KEY');
  const brevo = Deno.env.get('BREVO_API_KEY');
  if (!from || (!resend && !brevo)) {
    await sb.from('consultas').update({ avisada: false }).eq('id', c.id);
    return json({ ok: false, reason: 'sin proveedor configurado' });
  }

  let r: Response;
  if (resend) {
    r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName} <${from}>`, to: [para], reply_to: c.email, subject: asunto, html, text: texto }) });
  } else {
    r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': brevo!, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: fromName, email: from }, to: [{ email: para }], replyTo: { email: c.email, name: c.nombre }, subject: asunto, htmlContent: html, textContent: texto }) });
  }
  if (!r.ok) {
    await sb.from('consultas').update({ avisada: false }).eq('id', c.id);
    return json({ ok: false, status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
  }
  return json({ ok: true });
});
