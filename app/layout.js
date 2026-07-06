// The root layout wraps every page in the app.
// For this game there is only one page, but Next.js still requires a layout
// that defines the <html> and <body> wrapper.

import "./globals.css";

// This is the text shown in the browser tab.
export const metadata = {
  title: "One Button Everything",
  description: "A one-button game. Tap to play — figuring out what the button does is the game.",
};

// The viewport settings make the game behave on phones:
// - width follows the device screen
// - the user cannot pinch-zoom or double-tap-zoom (which would ruin the game)
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a12",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
