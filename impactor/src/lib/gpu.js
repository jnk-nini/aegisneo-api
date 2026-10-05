// A rough read on the graphics chip, so weak ones start in the lighter quality
// mode instead of stuttering through their first impact and switching mid-way.

/**
 * True for integrated laptop graphics, phone GPUs and software renderers.
 * Apple's own chips are fast enough for the full effects.
 */
export function isWeakRenderer(name = "") {
  if (/apple/i.test(name) && !/swiftshader/i.test(name)) return false;
  return /intel|uhd|iris|mali|adreno|powervr|videocore|swiftshader|llvmpipe|software|microsoft basic/i.test(
    name,
  );
}

/** The unmasked renderer name of a WebGL context, or "" if the browser hides it. */
export function rendererName(context) {
  try {
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER) ?? "");
  } catch {
    return "";
  }
}
