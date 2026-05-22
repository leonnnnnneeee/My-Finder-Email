import type { Metadata } from 'next'
export const metadata: Metadata = { 
  title: 'Coincu — Sales Intelligence', 
  description: 'Crypto Email Finder & Sales CRM',
  icons: { icon: 'https://coincu.com/wp-content/uploads/2021/08/coin1290.png' }
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{margin:0,padding:0,background:'#060910',fontFamily:"'DM Sans',sans-serif"}}>{children}</body>
    </html>
  )
}
