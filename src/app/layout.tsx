import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Email Finder', description: 'Tìm và gửi email' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body style={{margin:0,fontFamily:'system-ui,sans-serif',background:'#f4f6f9'}}>{children}</body></html>
}
