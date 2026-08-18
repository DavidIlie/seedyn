function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join("");
}

function unicodeFilename(value: string): string {
  const safe = stripControlCharacters(value.normalize("NFC"))
    .replace(/[\\/";]/g, "_")
    .trim();
  let output = "";
  for (const character of safe || "download") {
    if (new TextEncoder().encode(output + character).byteLength > 255) break;
    output += character;
  }
  return output || "download";
}

function asciiFilename(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "_").slice(0, 150) || "download";
}

function encode5987(value: string): string {
  return encodeURIComponent(value.normalize("NFC")).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function contentDispositionHeader(
  disposition: "INLINE" | "ATTACHMENT",
  originalName: string,
): string {
  const mode = disposition === "INLINE" ? "inline" : "attachment";
  const safeName = unicodeFilename(originalName);
  return `${mode}; filename="${asciiFilename(safeName)}"; filename*=UTF-8''${encode5987(safeName)}`;
}
