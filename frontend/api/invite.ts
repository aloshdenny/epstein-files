declare const process: { env: Record<string, string | undefined> }

type Config = Record<string, string | undefined>

export const config = { runtime: 'edge' }

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

export default async function handler(req: Request, local?: Config): Promise<Response> {
  const env: Config = typeof local?.SUPABASE_URL === 'string' ? local : process.env
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return json({ error: 'email invites are not configured' }, 503)

  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'sign in to send an invite' }, 401)

  let challenge = ''
  let email = ''
  try {
    const body = await req.json() as { challenge?: unknown; email?: unknown }
    challenge = typeof body.challenge === 'string' ? body.challenge.trim() : ''
    email = typeof body.email === 'string' ? body.email.trim() : ''
  } catch {
    return json({ error: 'invalid request body' }, 400)
  }
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(challenge) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: 'enter a valid challenge and email address' }, 400)

  const headers = { apikey: serviceKey, authorization, 'content-type': 'application/json' }
  const inviteResponse = await fetch(`${url}/rest/v1/rpc/create_invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_slug: challenge, p_channel: 'email', p_email: email, p_days: 14 }),
  })
  if (!inviteResponse.ok) {
    const detail = await inviteResponse.json().catch(() => ({})) as { message?: string; code?: string }
    return json({ error: inviteResponse.status === 401 || inviteResponse.status === 403
      ? 'Only challenge admins can invite labellers.'
      : detail.message ?? 'Could not create this invitation.' }, inviteResponse.status === 401 ? 401 : inviteResponse.status === 403 ? 403 : 400)
  }
  const rows = await inviteResponse.json() as { token: string }[]
  const token = rows[0]?.token
  if (!token) return json({ error: 'invitation was not created' }, 502)

  const origin = new URL(req.url).origin
  const link = new URL(`/join/${encodeURIComponent(token)}`, origin).toString()
  const redirect = encodeURIComponent(link)
  const inviteUrl = `${url}/auth/v1/invite?redirect_to=${redirect}`
  const send = (path: string, body: Record<string, unknown>) => fetch(path, {
    method: 'POST',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let sent = await send(inviteUrl, { email, data: { challenge, site_name: 'dabel' } })
  if (sent.status === 422) {
    sent = await send(`${url}/auth/v1/otp?redirect_to=${redirect}`, { email, create_user: false })
  }
  if (!sent.ok) return json({ error: 'email delivery failed' }, 502)
  return json({ sent: true, link })
}
