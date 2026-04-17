import type { Metadata } from 'next';
import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import FarcasterWrapper from "@/components/FarcasterWrapper";

export const metadata: Metadata = {
  title: "jumparun",
  description: "Endless jumper game with tap to jump mechanics. Avoid obstacles, purchase 10x auto-jump for $0.0001 in Base ETH. Intensifies over time. Integrates with Base wallet for seamless play.",
  other: { 
    "base:app_id": "6943dd0cd77c069a945bdffd",
    "fc:frame": JSON.stringify({
      "version":"next",
      "imageUrl":"https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/thumbnail_b7e73ae8-8ba7-4a98-ada1-621195d4439f-ST8iDzsWSHB58RfyEW2dXKt0tEPSKq",
      "button":{
        "title":"Open with Ohara",
        "action":{
          "type":"launch_frame",
          "name":"jumparun",
          "url":"https://camera-onto-814.app.ohara.ai",
          "splashImageUrl":"https://usdozf7pplhxfvrl.public.blob.vercel-storage.com/farcaster/splash_images/splash_image1.svg",
          "splashBackgroundColor":"#ffffff"
        }
      }
    }) 
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <FarcasterWrapper>
            {children}
          </FarcasterWrapper>
        </Providers>
      </body>
    </html>
  );
}
