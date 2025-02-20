/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/aso/:path*',
        destination: 'https://159.112.182.31:3000/api/aso/:path*',
      },
    ]
  },
}

module.exports = nextConfig 