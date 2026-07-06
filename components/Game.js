"use client";
// The "use client" line above tells Next.js this code runs in the browser
// (not on the server). We need that because the game uses the canvas, animation,
// and keyboard/touch events, all of which only exist in a browser.

import { useEffect, useRef, useState } from "react";
import { createGame } from "../game/engine";

// This React component's only job is to:
//   1. Put a <canvas> element on the page (but ONLY in the browser).
//   2. When that canvas appears, start the game engine on it.
//   3. When the page goes away, cleanly stop the engine.
//
// Everything about how the game actually works lives in game/engine.js and
// the stage files. This file is deliberately tiny.
//
// WHY THE "mounted" FLAG (the hydration-mismatch fix)
// ---------------------------------------------------
// Next.js renders this page twice: once on the server to produce the initial
// HTML, and again in the browser to "hydrate" it (wire it up). React insists the
// two renders produce IDENTICAL output — if they differ, you get the
// "server rendered HTML didn't match the client" error.
//
// A canvas game is inherently a browser-only thing: it needs window, animation,
// touch events, and (now) random level layouts. None of that exists on the
// server. Rather than try to fake it, we simply DON'T render the canvas on the
// server at all. Both the server and the very first browser render return null,
// so they match perfectly. Only AFTER the component has mounted in the browser
// do we flip "mounted" to true and render the real canvas. By then hydration is
// done, so there is nothing left to mismatch — and every browser-only value
// (including Math.random level generation) is guaranteed to run client-side.
export default function Game() {
  // A "ref" is React's way of getting a direct handle to the real canvas
  // element in the page so we can draw on it.
  const canvasRef = useRef(null);

  // Starts false (matches the server). Flips to true once we're in the browser.
  const [mounted, setMounted] = useState(false);

  // This effect runs only in the browser, only once, right after the first
  // render. It's what tells us it's now safe to show the canvas.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Once mounted, the canvas exists in the page, so start the engine on it.
  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Start the game engine on this canvas. It returns a "stop" function that
    // tears everything down (stops animation, removes event listeners).
    const stop = createGame(canvas);

    // React calls this returned function when the component is removed (or before
    // re-running this effect). We use it to make sure nothing keeps running.
    return stop;
  }, [mounted]);

  // On the server and the first browser render, show nothing. The dark page
  // background from globals.css fills the screen in the meantime.
  if (!mounted) return null;

  return <canvas ref={canvasRef} />;
}
