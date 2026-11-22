export type DetectedEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'windows-1255';

export interface DecodedText {
  text: string;
  encoding: DetectedEncoding;
  /** Short human-readable explanation of how the encoding was chosen (goes in the import report). */
  detection: string;
}

const HEBREW_LETTER = /[\u05D0-\u05EA]/g;

/**
 * Detects the encoding of a Hebrew CSV and decodes it. Order:
 *  1. BOM            -> UTF-8 / UTF-16 LE / UTF-16 BE
 *  2. strict UTF-8   -> if the bytes are valid UTF-8 (pure ASCII included)
 *  3. UTF-16 w/o BOM -> if a large share of bytes at even or odd positions are 0x00
 *  4. windows-1255   -> the classic Excel / Windows Hebrew encoding, accepted only if the result
 *                       actually looks like Hebrew text; otherwise we throw rather than guess.
 */
export function decodeCsvBuffer(buffer: Buffer): DecodedText {
  const b = buffer;

  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return { text: b.subarray(3).toString('utf8'), encoding: 'utf-8-bom', detection: 'UTF-8 BOM' };
  }
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le', detection: 'UTF-16 LE BOM' };
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be', detection: 'UTF-16 BE BOM' };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8', detection: 'valid UTF-8 (no BOM)' };
  } catch {
    // not UTF-8, keep trying
  }

  const sample = b.subarray(0, Math.min(b.length, 4096));
  let evenZeros = 0;
  let oddZeros = 0;
  sample.forEach((byte, i) => {
    if (byte !== 0) return;
    if (i % 2 === 0) evenZeros++;
    else oddZeros++;
  });
  const pairs = Math.max(1, Math.floor(sample.length / 2));
  if (oddZeros / pairs > 0.3 && evenZeros / pairs < 0.05) {
    return { text: new TextDecoder('utf-16le').decode(b), encoding: 'utf-16le', detection: 'UTF-16 LE without BOM (null-byte pattern)' };
  }
  if (evenZeros / pairs > 0.3 && oddZeros / pairs < 0.05) {
    return { text: new TextDecoder('utf-16be').decode(b), encoding: 'utf-16be', detection: 'UTF-16 BE without BOM (null-byte pattern)' };
  }

  const text = new TextDecoder('windows-1255').decode(b);
  const hebrew = (text.match(HEBREW_LETTER) ?? []).length;
  const nonAscii = [...text].filter((ch) => ch.charCodeAt(0) > 0x7f).length;
  const replacement = (text.match(/\uFFFD/g) ?? []).length;
  if (hebrew > 0 && hebrew / Math.max(1, nonAscii) > 0.8 && replacement === 0) {
    return {
      text,
      encoding: 'windows-1255',
      detection: `not UTF-8/UTF-16; decoded as windows-1255 (${hebrew} Hebrew letters, ${nonAscii} non-ASCII chars)`,
    };
  }
  throw new Error(
    'Could not determine the file encoding: not UTF-8, not UTF-16 and the windows-1255 result does not look like Hebrew. ' +
      'Convert the file to UTF-8 and retry.',
  );
}
