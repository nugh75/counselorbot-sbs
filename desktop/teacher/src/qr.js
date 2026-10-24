// Generatore QR Code compatto e autosufficiente (basato su Nayuki QrCode / MIT).
// Produce output SVG ad alta definizione senza dipendenze esterne.
(function (global) {
  'use strict';

  const Ecc = {
    LOW: { ordinal: 0, formatBits: 1 },
    MEDIUM: { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH: { ordinal: 3, formatBits: 2 },
  };

  class QrCode {
    constructor(version, ecc, dataCodewords, msk) {
      if (version < 1 || version > 40) throw new RangeError('Versione QR non valida');
      if (msk < -1 || msk > 7) throw new RangeError('Maschera QR non valida');
      this.version = version;
      this.size = version * 4 + 17;
      this.ecc = ecc;

      const size = this.size;
      this.modules = Array.from({ length: size }, () => new Array(size).fill(false));
      this.isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

      this._drawFunctionPatterns();
      const allCodewords = this._addEccAndInterleave(dataCodewords);
      this._drawCodewords(allCodewords);

      if (msk === -1) {
        let minPenalty = 1e9;
        let bestMask = 0;
        for (let i = 0; i < 8; i++) {
          this._applyMask(i);
          this._drawFormatBits(i);
          const penalty = this._getPenaltyScore();
          if (penalty < minPenalty) {
            minPenalty = penalty;
            bestMask = i;
          }
          this._applyMask(i);
        }
        msk = bestMask;
      }
      this.mask = msk;
      this._applyMask(msk);
      this._drawFormatBits(msk);
    }

    getModule(x, y) {
      return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
    }

    toSvg(margin = 2, size = 200) {
      const viewBoxSize = this.size + margin * 2;
      let path = '';
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          if (this.modules[y][x]) {
            path += `M${x + margin},${y + margin}h1v1h-1z `;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
        `<rect width="100%" height="100%" fill="#ffffff" rx="4"/>` +
        `<path d="${path}" fill="#000000"/>` +
        `</svg>`;
    }

    _setFunctionModule(x, y, isDark) {
      this.modules[y][x] = isDark;
      this.isFunction[y][x] = true;
    }

    _drawFunctionPatterns() {
      const size = this.size;
      // Finder patterns
      this._drawFinder(0, 0);
      this._drawFinder(size - 7, 0);
      this._drawFinder(0, size - 7);

      // Separators
      for (let i = 0; i < 8; i++) {
        this._setFunctionModule(7, i, false);
        this._setFunctionModule(i, 7, false);
        this._setFunctionModule(size - 8, i, false);
        this._setFunctionModule(size - 1 - i, 7, false);
        this._setFunctionModule(7, size - 1 - i, false);
        this._setFunctionModule(i, size - 8, false);
      }
      this._setFunctionModule(7, 7, false);

      // Timing patterns
      for (let i = 8; i < size - 8; i++) {
        this._setFunctionModule(6, i, i % 2 === 0);
        this._setFunctionModule(i, 6, i % 2 === 0);
      }

      // Alignment patterns
      const align = ALIGN_POS[this.version];
      for (let i = 0; i < align.length; i++) {
        for (let j = 0; j < align.length; j++) {
          if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
          this._drawAlignment(align[i], align[j]);
        }
      }

      // Version info (v >= 7)
      if (this.version >= 7) {
        let rem = this.version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const bits = (this.version << 12) | rem;
        for (let i = 0; i < 18; i++) {
          const bit = ((bits >>> i) & 1) !== 0;
          const a = size - 11 + (i % 3);
          const b = Math.floor(i / 3);
          this._setFunctionModule(a, b, bit);
          this._setFunctionModule(b, a, bit);
        }
      }

      this._drawFormatBits(0);
      this._setFunctionModule(8, size - 8, true);
    }

    _drawFinder(x, y) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          this._setFunctionModule(x + dx, y + dy, dist !== 2);
        }
      }
    }

    _drawAlignment(x, y) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          this._setFunctionModule(x + dx, y + dy, dist !== 1);
        }
      }
    }

    _drawFormatBits(msk) {
      const data = (this.ecc.formatBits << 3) | msk;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const size = this.size;

      for (let i = 0; i <= 5; i++) this._setModule(8, i, ((bits >>> i) & 1) !== 0);
      this._setModule(8, 7, ((bits >>> 6) & 1) !== 0);
      this._setModule(8, 8, ((bits >>> 7) & 1) !== 0);
      this._setModule(7, 8, ((bits >>> 8) & 1) !== 0);
      for (let i = 9; i < 15; i++) this._setModule(14 - i, 8, ((bits >>> i) & 1) !== 0);

      for (let i = 0; i < 8; i++) this._setModule(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
      for (let i = 8; i < 15; i++) this._setModule(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
    }

    _setModule(x, y, isDark) {
      this.modules[y][x] = isDark;
    }

    _drawCodewords(allCodewords) {
      const size = this.size;
      let i = 0;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
          for (let j = 0; j < 2; j++) {
            const x = right - j;
            const upward = ((right + 1) & 2) === 0;
            const y = upward ? size - 1 - vert : vert;
            if (!this.isFunction[y][x] && i < allCodewords.length * 8) {
              this.modules[y][x] = ((allCodewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
              i++;
            }
          }
        }
      }
    }

    _applyMask(msk) {
      const size = this.size;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!this.isFunction[y][x]) {
            let invert = false;
            switch (msk) {
              case 0: invert = (x + y) % 2 === 0; break;
              case 1: invert = y % 2 === 0; break;
              case 2: invert = x % 3 === 0; break;
              case 3: invert = (x + y) % 3 === 0; break;
              case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
              case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
              case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
              case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
            }
            if (invert) this.modules[y][x] = !this.modules[y][x];
          }
        }
      }
    }

    _getPenaltyScore() {
      const size = this.size;
      let penalty = 0;

      // N1: runs >= 5
      for (let y = 0; y < size; y++) {
        let runColor = false;
        let runVal = 0;
        for (let x = 0; x < size; x++) {
          const color = this.modules[y][x];
          if (color === runColor) {
            runVal++;
            if (runVal === 5) penalty += 3;
            else if (runVal > 5) penalty += 1;
          } else {
            runColor = color;
            runVal = 1;
          }
        }
      }
      for (let x = 0; x < size; x++) {
        let runColor = false;
        let runVal = 0;
        for (let y = 0; y < size; y++) {
          const color = this.modules[y][x];
          if (color === runColor) {
            runVal++;
            if (runVal === 5) penalty += 3;
            else if (runVal > 5) penalty += 1;
          } else {
            runColor = color;
            runVal = 1;
          }
        }
      }

      // N2: 2x2 blocks
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const c = this.modules[y][x];
          if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) {
            penalty += 3;
          }
        }
      }

      // N3: finder patterns
      for (let y = 0; y < size; y++) {
        let bits = 0;
        for (let x = 0; x < size; x++) {
          bits = ((bits << 1) & 0x7ff) | (this.modules[y][x] ? 1 : 0);
          if (x >= 10 && (bits === 0x05d || bits === 0x5d0)) penalty += 40;
        }
      }
      for (let x = 0; x < size; x++) {
        let bits = 0;
        for (let y = 0; y < size; y++) {
          bits = ((bits << 1) & 0x7ff) | (this.modules[y][x] ? 1 : 0);
          if (y >= 10 && (bits === 0x05d || bits === 0x5d0)) penalty += 40;
        }
      }

      // N4: dark module ratio
      let dark = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (this.modules[y][x]) dark++;
        }
      }
      const total = size * size;
      const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
      penalty += k * 10;

      return penalty;
    }

    _addEccAndInterleave(data) {
      const ver = this.version;
      const ecc = this.ecc;
      const numBlocks = NUM_ECC_BLOCKS[ecc.ordinal][ver];
      const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc.ordinal][ver];
      const rawCodewords = Math.floor(NUM_RAW_DATA_MODULES[ver] / 8);
      const dataLen = rawCodewords - blockEccLen * numBlocks;
      const shortBlockLen = Math.floor(dataLen / numBlocks);
      const numShortBlocks = numBlocks - (dataLen % numBlocks);

      const blocks = [];
      const rsDiv = ReedSolomon.divisor(blockEccLen);
      let k = 0;
      for (let i = 0; i < numBlocks; i++) {
        const len = shortBlockLen + (i < numShortBlocks ? 0 : 1);
        const dat = data.slice(k, k + len);
        k += len;
        const eccDat = ReedSolomon.remainder(dat, rsDiv);
        blocks.push({ data: dat, ecc: eccDat });
      }

      const res = [];
      const maxDataLen = shortBlockLen + 1;
      for (let i = 0; i < maxDataLen; i++) {
        for (let j = 0; j < numBlocks; j++) {
          if (i < blocks[j].data.length) res.push(blocks[j].data[i]);
        }
      }
      for (let i = 0; i < blockEccLen; i++) {
        for (let j = 0; j < numBlocks; j++) {
          res.push(blocks[j].ecc[i]);
        }
      }
      return res;
    }

    static encodeText(text, ecc = Ecc.MEDIUM) {
      const bytes = new TextEncoder().encode(text);
      let ver = 1;
      for (; ver <= 40; ver++) {
        const rawCodewords = Math.floor(NUM_RAW_DATA_MODULES[ver] / 8);
        const dataCap = rawCodewords - ECC_CODEWORDS_PER_BLOCK[ecc.ordinal][ver] * NUM_ECC_BLOCKS[ecc.ordinal][ver];
        const countBits = ver <= 9 ? 8 : 16;
        const totalBits = 4 + countBits + bytes.length * 8;
        if (totalBits <= dataCap * 8) break;
      }
      if (ver > 40) throw new Error('Dati troppo lunghi per il codice QR');

      const rawCodewords = Math.floor(NUM_RAW_DATA_MODULES[ver] / 8);
      const dataCapacity = rawCodewords - ECC_CODEWORDS_PER_BLOCK[ecc.ordinal][ver] * NUM_ECC_BLOCKS[ecc.ordinal][ver];

      const bb = [];
      const appendBits = (val, len) => {
        for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
      };

      // Byte mode: 0100
      appendBits(0b0100, 4);
      appendBits(bytes.length, ver <= 9 ? 8 : 16);
      for (const b of bytes) appendBits(b, 8);

      // Terminator
      const termLen = Math.min(4, dataCapacity * 8 - bb.length);
      appendBits(0, termLen);

      while (bb.length % 8 !== 0) bb.push(0);

      const padBytes = [0xec, 0x11];
      let padIdx = 0;
      while (bb.length < dataCapacity * 8) {
        appendBits(padBytes[padIdx % 2], 8);
        padIdx++;
      }

      const dataCodewords = [];
      for (let i = 0; i < bb.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
        dataCodewords.push(byte);
      }

      return new QrCode(ver, ecc, dataCodewords, -1);
    }
  }

  const ReedSolomon = (() => {
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      EXP[i + 255] = x;
      LOG[x] = i;
      x = (x << 1) ^ ((x >>> 7) * 0x11d);
    }
    const multiply = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

    return {
      divisor(degree) {
        const div = new Uint8Array(degree + 1);
        div[degree] = 1;
        let root = 1;
        for (let i = 0; i < degree; i++) {
          for (let j = 0; j < degree; j++) {
            div[j] = multiply(div[j], root) ^ div[j + 1];
          }
          div[degree] = multiply(div[degree], root);
          root = multiply(root, 0x02);
        }
        return div;
      },
      remainder(data, divisor) {
        const deg = divisor.length - 1;
        const rem = new Uint8Array(deg);
        for (const b of data) {
          const factor = b ^ rem[0];
          for (let j = 0; j < deg - 1; j++) rem[j] = rem[j + 1] ^ multiply(factor, divisor[j + 1]);
          rem[deg - 1] = multiply(factor, divisor[deg]);
        }
        return rem;
      },
    };
  })();

  const NUM_RAW_DATA_MODULES = [
    0, 208, 359, 567, 807, 1079, 1383, 1568, 1936, 2336, 2768, 3232, 3728, 4256, 4651, 5243, 5867, 6523, 7211, 7931,
    8683, 9252, 10068, 10916, 11796, 12708, 13652, 14628, 15371, 16411, 17483, 18587, 19723, 20891, 22091, 23008,
    24272, 25568, 26896, 28256, 29648,
  ];

  const ECC_CODEWORDS_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  const NUM_ECC_BLOCKS = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  const ALIGN_POS = [
    [], [],
    [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
    [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
    [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];

  const exportObj = {
    Ecc,
    encodeText: QrCode.encodeText,
    generateSvg: (text, margin = 2, size = 200) => QrCode.encodeText(text, Ecc.MEDIUM).toSvg(margin, size),
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  } else {
    global.QrCode = exportObj;
  }
})(typeof window !== 'undefined' ? window : globalThis);
