import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function localInvite(env: Record<string, string>): Plugin {
  return {
    name: 'dabel-local-invite',
    configureServer(server) {
      type InviteModule = { default: (req: Request, env: Record<string, string>) => Promise<Response> }
      let modulePromise: Promise<InviteModule> | undefined
      server.middlewares.use('/api/invite', async (req, res, next) => {
        try {
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (typeof value === 'string') headers.set(name, value)
            else if (Array.isArray(value)) headers.set(name, value.join(', '))
          }
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => resolve(Buffer.concat(chunks)))
            req.on('error', reject)
          })
          const protocol = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'] : 'http'
          const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost:5173'
          const request = new Request(`${protocol}://${host}/api/invite`, { method: req.method, headers, body })
          modulePromise ??= server.ssrLoadModule('/api/invite.ts') as unknown as Promise<InviteModule>
          const { default: handler } = await modulePromise
          const response = await handler(request, env)
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => res.setHeader(key, value))
          res.end(await response.text())
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// Dev mirrors the Vercel proxy (api/sb.ts): /sb/* goes to Supabase with the key added here, never in the bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.SUPABASE_ANON_KEY ?? ''
  return {
    plugins: [react(), tailwindcss(), localInvite(env)],
    server: {
      proxy: {
        '/sb': {
          target: env.SUPABASE_URL || 'http://127.0.0.1:54321',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/sb/, ''),
          configure: (proxy) =>
            proxy.on('proxyReq', (req) => {
              req.setHeader('apikey', key)
              const auth = req.getHeader('authorization')
              if (!auth || auth === 'Bearer public') req.setHeader('authorization', `Bearer ${key}`)
            }),
        },
      },
    },
  }
})
