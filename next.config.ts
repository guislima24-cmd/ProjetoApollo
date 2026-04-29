import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Permite que a extensão Chrome chame as rotas /api/*
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Session-Token' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ]
  },
}

export default nextConfig
