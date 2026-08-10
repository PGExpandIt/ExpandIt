// Generates src/app/favicon.ico from the vallus palisade mark.
//
// Why this exists rather than a checked-in binary nobody can regenerate: the mark
// is seven rectangles, so rasterising it needs no image library at all. Run
// `node scripts/make-favicon.mjs` after any brand change and commit the result.
//
// ICO cannot carry a media query, so unlike src/app/icon.svg it cannot follow the
// browser theme. It is drawn mint on dark: mint on a light tab strip would sit at
// roughly 1.9:1 contrast and disappear, while the dark tile reads on both.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BACKGROUND = [0x1f, 0x1e, 0x1b, 0xff];
const MARK = [0x7d, 0xd3, 0xa0, 0xff];

// Geometry copied from src/app/icon.svg (viewBox 0 0 153 120).
const BARS = [
    { x: 24, y: 24, w: 9, h: 72 },
    { x: 40, y: 40, w: 9, h: 56 },
    { x: 56, y: 56, w: 9, h: 40 },
    { x: 72, y: 66, w: 9, h: 30 },
    { x: 88, y: 56, w: 9, h: 40 },
    { x: 104, y: 40, w: 9, h: 56 },
    { x: 120, y: 24, w: 9, h: 72 },
];
const CONTENT = { x: 24, y: 24, w: 105, h: 72 };

const SIZES = [16, 32, 48];
const SUPERSAMPLE = 4;

// Bar heights as a fraction of the tallest bar, taken from the SVG (72, 56, 40, 30, ...).
const BAR_HEIGHTS = BARS.map((bar) => bar.h / CONTENT.h);
// The mark keeps the aspect ratio of the original artwork.
const CONTENT_ASPECT = CONTENT.h / CONTENT.w;

const insideRoundedRect = (px, py, x, y, w, h, r) => {
    if (px < x || py < y || px > x + w || py > y + h) return false;
    const radius = Math.min(r, w / 2, h / 2);
    if (radius <= 0) return true;
    const cx = Math.min(Math.max(px, x + radius), x + w - radius);
    const cy = Math.min(Math.max(py, y + radius), y + h - radius);
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
};

// Coverage of the rounded background tile, supersampled so its corners stay smooth.
// The bars are not sampled this way on purpose: at 16 px their gaps fall below one
// pixel and antialiasing turns the palisade into a green smear. They are snapped to
// whole pixels instead, which is what makes the mark legible in a tab strip.
const tileCoverage = (size) => {
    const radius = size * SUPERSAMPLE * 0.18;
    const coverage = new Float32Array(size * size);
    const step = 1 / SUPERSAMPLE;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            let hits = 0;
            for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
                for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
                    const px = (x + (sx + 0.5) * step) * SUPERSAMPLE;
                    const py = (y + (sy + 0.5) * step) * SUPERSAMPLE;
                    if (insideRoundedRect(px, py, 0, 0, size * SUPERSAMPLE, size * SUPERSAMPLE, radius)) {
                        hits += 1;
                    }
                }
            }
            coverage[y * size + x] = hits / (SUPERSAMPLE * SUPERSAMPLE);
        }
    }
    return coverage;
};

// Bars and gaps get the same whole-pixel width, so the seven-bar rhythm survives
// even at 16 px, where the artwork's 9:7 ratio cannot be expressed at all.
const barLayout = (size) => {
    const unit = Math.max(1, Math.round(size * 0.055));
    const width = unit * (BARS.length * 2 - 1);
    const maxHeight = Math.round(width * CONTENT_ASPECT);
    const left = Math.floor((size - width) / 2);
    const bottom = Math.round((size - maxHeight) / 2) + maxHeight;

    return BAR_HEIGHTS.map((ratio, index) => {
        const height = Math.max(1, Math.round(maxHeight * ratio));
        return { x: left + index * 2 * unit, y: bottom - height, w: unit, h: height };
    });
};

const renderSquare = (size) => {
    const pixels = new Uint8Array(size * size * 4);
    const coverage = tileCoverage(size);

    for (let i = 0; i < size * size; i += 1) {
        const alpha = coverage[i];
        if (alpha <= 0) continue;
        pixels[i * 4] = BACKGROUND[0];
        pixels[i * 4 + 1] = BACKGROUND[1];
        pixels[i * 4 + 2] = BACKGROUND[2];
        pixels[i * 4 + 3] = Math.round(alpha * 255);
    }

    for (const bar of barLayout(size)) {
        for (let y = bar.y; y < bar.y + bar.h; y += 1) {
            for (let x = bar.x; x < bar.x + bar.w; x += 1) {
                if (x < 0 || y < 0 || x >= size || y >= size) continue;
                const at = (y * size + x) * 4;
                pixels[at] = MARK[0];
                pixels[at + 1] = MARK[1];
                pixels[at + 2] = MARK[2];
                pixels[at + 3] = 255;
            }
        }
    }

    return pixels;
};

// --- minimal PNG encoder (RGBA, no interlacing) ---

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
};

const encodePng = (rgba, size) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: RGBA
    // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y += 1) {
        raw[y * (size * 4 + 1)] = 0; // filter type: none
        Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(
            raw,
            y * (size * 4 + 1) + 1,
        );
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
};

// --- ICO container holding one PNG per size ---

const buildIco = (images) => {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(images.length, 4);

    const directory = Buffer.alloc(16 * images.length);
    let offset = header.length + directory.length;

    images.forEach((image, index) => {
        const at = index * 16;
        directory[at] = image.size >= 256 ? 0 : image.size;
        directory[at + 1] = image.size >= 256 ? 0 : image.size;
        directory[at + 2] = 0; // palette size
        directory[at + 3] = 0; // reserved
        directory.writeUInt16LE(1, at + 4); // colour planes
        directory.writeUInt16LE(32, at + 6); // bits per pixel
        directory.writeUInt32LE(image.png.length, at + 8);
        directory.writeUInt32LE(offset, at + 12);
        offset += image.png.length;
    });

    return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
};

const images = SIZES.map((size) => ({ size, png: encodePng(renderSquare(size), size) }));
const target = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "favicon.ico");
writeFileSync(target, buildIco(images));

console.log(`favicon.ico: ${SIZES.join(", ")} px — ${buildIco(images).length} bytes -> ${target}`);
