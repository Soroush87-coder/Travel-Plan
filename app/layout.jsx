import "./globals.css";

export const metadata = {
  title: "Travel Itinerary Generator",
  description: "Generate a concise, professional multi-destination travel itinerary you can save as PDF.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
