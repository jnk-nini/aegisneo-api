// Screen-space glow. The scene renders in HDR (half-float), and anything
// brighter than white (fireball, molten rock, hot ejecta, fires, city lights)
// bleeds light into its surroundings, the way a camera sees it. Ordinary
// surfaces stay below the threshold, so the globe itself looks unchanged.
import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, FXAA } from "@react-three/postprocessing";
import { useSim } from "../store.js";

export default function PostFX() {
  const lowQuality = useSim((s) => s.quality === "low");
  const composer = useRef();
  const gl = useThree((s) => s.gl);

  // "Save image" renders one frame through the composer and reads the canvas
  // straight away (no preserveDrawingBuffer needed).
  useEffect(() => {
    useSim.setState({
      capture: () =>
        new Promise((resolve) => {
          composer.current?.render();
          gl.domElement.toBlob(resolve, "image/png");
        }),
    });
    return () => useSim.setState({ capture: null });
  }, [gl]);

  return (
    // Hardware multisampling of the HDR buffer halves the frame rate on integrated
    // GPUs; FXAA smooths edges for a fraction of the cost.
    <EffectComposer ref={composer} multisampling={0}>
      <Bloom
        mipmapBlur
        luminanceThreshold={1.1}
        luminanceSmoothing={0.3}
        intensity={lowQuality ? 0.5 : 0.65}
        radius={0.6}
        levels={lowQuality ? 5 : 7}
        resolutionScale={lowQuality ? 0.5 : 1}
      />
      <FXAA />
    </EffectComposer>
  );
}
