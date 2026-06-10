export const metadata = {
  title: 'Travel Market — Itinerary Generator',
  description: 'Travel itinerary generator by Travel Market',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
