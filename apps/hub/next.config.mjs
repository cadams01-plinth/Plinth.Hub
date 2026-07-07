/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      // SPEC §3: JWKS cached for 1 h
      source: '/.well-known/plinth-sso.json',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=3600' }],
    },
  ],
}

export default nextConfig
