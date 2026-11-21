import Image from "next/image";

type HarborSymbol = "heart" | "pause" | "speed" | "play" | "tools" | "gift" | "ship" | "flag";

export default function HarborGlyph({ symbol }: { symbol: HarborSymbol }) {
  return <Image className="harbor-glyph" src={`/assets/workshop/hud-glyphs/${symbol}.webp`} width={64} height={64} alt="" draggable={false} unoptimized />;
}
