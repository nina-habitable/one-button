// This is the single page of the app — the home page at "/".
// It does almost nothing except place the Game component on the screen.
// All the real work lives inside components/Game.js.

import Game from "../components/Game";

export default function Home() {
  return <Game />;
}
