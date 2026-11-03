import './globals.css';

export const metadata = {
  title: 'Endurance Canvas — Interactive learning studio',
  description: 'Build, explore, and refine clear interactive explanations of endurance science.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#f5f6f0' };

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
