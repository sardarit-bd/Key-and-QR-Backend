/**
 * Defensive SVG sanitizer for category icon uploads.
 *
 * We do NOT rely on dangerouslySetInnerHTML anywhere — the uploaded SVG is
 * stored on Cloudinary and rendered as an <img src> tag, so it's never
 * executed as inline markup. This sanitizer is an extra belt-and-suspenders
 * layer that rejects malicious content BEFORE it reaches Cloudinary.
 *
 * Rejects:
 *  - scripts / event handlers (onload, onclick, ...)
 *  - javascript: / data: URLs (except data:image/svg+xml when base64-encoded
 *    plain SVG without executable payloads is passed)
 *  - <foreignObject> (HTML/JS embedding vector)
 *  - <object> / <embed> / <iframe> / <link> / <style>
 *  - external references (xlink:href, <image href>) to remote URLs
 *  - SVG animation/smil that can be abused (animate, animateTransform,
 *    set, animateMotion)
 */

const DANGEROUS_TAGS = /<(script|foreignObject|object|embed|iframe|link|style|animate|animateTransform|animateMotion|set)\b/i;
const EVENT_HANDLERS = /\son\w+\s*=/gi;
const JAVASCRIPT_URI = /\s(?:href|xlink:href)\s*=\s*["']?\s*javascript:/i;
const EXTERNAL_HREF = /\s(?:href|xlink:href)\s*=\s*["']?\s*(?:https?:|ftp:|\/\/|[a-z][a-z0-9+.-]*:\/\/)/i;
const DATA_URI = /data:/i;

/**
 * Validate + sanitize an SVG string.
 * @param {string} svg - Raw SVG markup.
 * @param {object} options
 * @returns {{ ok: true, svg: string } | { ok: false, error: string }}
 */
export function sanitizeSvg(svg, { maxBytes = 500 * 1024 } = {}) {
  if (typeof svg !== "string" || !svg.trim()) {
    return { ok: false, error: "Empty SVG content" };
  }

  const sizeBytes = Buffer.byteLength(svg, "utf8");
  if (sizeBytes > maxBytes) {
    return { ok: false, error: `SVG exceeds ${Math.round(maxBytes / 1024)}KB limit` };
  }

  if (DANGEROUS_TAGS.test(svg)) {
    return { ok: false, error: "SVG contains dangerous elements (scripts, foreignObject, object, embed, iframe, style, SMIL)" };
  }

  if (EVENT_HANDLERS.test(svg)) {
    return { ok: false, error: "SVG contains event handler attributes" };
  }

  if (JAVASCRIPT_URI.test(svg)) {
    return { ok: false, error: "SVG contains javascript: URL" };
  }

  if (EXTERNAL_HREF.test(svg)) {
    return { ok: false, error: "SVG contains external URL references" };
  }

  if (DATA_URI.test(svg)) {
    return { ok: false, error: "SVG contains data: URIs" };
  }

  // Must be an SVG root element.
  if (!/<svg[\s>]/i.test(svg)) {
    return { ok: false, error: "Not a valid SVG document" };
  }

  return { ok: true, svg };
}

export default sanitizeSvg;
