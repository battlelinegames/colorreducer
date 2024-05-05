const CYAN = '\x1b[36m%s\x1b[37m'
const RED = '\x1b[31m';
const WHITE = '\x1b[37m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

const PNG = require("pngjs").PNG;
const fs = require('fs');
var paletteMap; // = new Map();

const COLOR_TYPE = {
  GRAYSCALE: 0,
  RGB: 2,
  GRAYSCALE_ALPHA: 4,
  RGBA: 6,
}

const searchMap = new Map();

function findCloseColor(color, toleranceShift, tolerance) {
  const red = color >>> (24 + toleranceShift);
  const green = (color >>> (16 + toleranceShift)) & (0xff >>> toleranceShift);
  const blue = (color >>> (8 + toleranceShift)) & (0xff >>> toleranceShift);
  const alpha = (color >>> toleranceShift) & (0xff >>> toleranceShift);

  const searchValue = (red << (24 - toleranceShift)) |
    (green << (16 - toleranceShift)) |
    (blue << (8 - toleranceShift)) | alpha;

  let foundValues = searchMap.get(searchValue);

  if (foundValues == null) {
    searchMap.set(searchValue, [color]);
    return color;
  }
  else {
    const [r, g, b, a] = splitColor(color)


    let closeColor = null;
    let lowMeanSQError = 0x0f_ff_ff_ff;

    for (let i = 0; i < foundValues.length; i++) {
      let colorValue = foundValues[i];
      const [fr, fg, fb, fa] = splitColor(colorValue)

      let frdiff = fr - r;
      let fgdiff = fg - g;
      let fbdiff = fb - b;
      let fadiff = fa - a;

      if (Math.abs(frdiff) <= tolerance &&
        Math.abs(fgdiff) <= tolerance &&
        Math.abs(fbdiff) <= tolerance &&
        Math.abs(fadiff) <= tolerance * 2) { // higher tolerance on transparancy
        //return colorValue;
        let meanSQErr = frdiff * frdiff + fgdiff * fgdiff +
          fbdiff * fbdiff + fadiff * fadiff;

        if (meanSQErr < lowMeanSQError) {
          lowMeanSQError = meanSQErr;
          closeColor = colorValue;
        }
      }
    }

    if (closeColor != null) {
      return closeColor;
    }

    foundValues.push(color);
    return color;
  }

}


function analyze(pngInfo, logFile) {
  paletteMap = new Map();
  let buffer = pngInfo.data;
  let len = pngInfo.data.length;
  for (let i = 0; i < len; i += 4) {

    let dataVal; // = buffer.readUInt32BE(i);
    if (buffer.readUInt32BE) {
      dataVal = buffer.readUInt32BE(i);
    }
    else {
      dataVal = buffer[Math.floor(i / 4)];
    }

    let mapVal = paletteMap.get(dataVal);

    if (mapVal == null) {
      paletteMap.set(dataVal, 1);
    }
    else {
      paletteMap.set(dataVal, mapVal + 1);
    }

  }

  let sortedArray = [];
  let singleCount = 0;
  let dupCount = 0;
  let palette_bytes = 0;


  for (let [key, value] of paletteMap.entries()) {
    if (value > 1) {
      palette_bytes += 4;
      dupCount += value;
      sortedArray.push({
        palette: key,
        count: value
      })
    }
    else {
      singleCount++;
    }
  }


  sortedArray.sort((a, b) => {
    return b.count - a.count;
  });

  let sizeAdjust = 0;
  for (let i = 0; i < sortedArray.length; i++) {
    let entry = sortedArray[i];
    if (i < 8) { // 2 ** 3
      sizeAdjust -= entry.count * 3.5;
    }
    else if (i < 72) { // 2 ** 6
      sizeAdjust -= entry.count * 3;
    }
    else if (i < 584) { // 2 ** 9
      sizeAdjust -= entry.count * 2.5;
    }
    else if (i < 4680) { // 2 ** 12
      sizeAdjust -= entry.count * 2;
    }
    else if (i < 37448) {
      sizeAdjust -= entry.count * 1.5;
    }
    else if (i < 299_592) {
      sizeAdjust -= entry.count * 1;
    }
    else if (i < 2_396_744) {
      sizeAdjust -= entry.count * 0.5;
    }
    else if (i < 17_013_960) {
      sizeAdjust += 0;
    }
    else {
      sizeAdjust += entry.count;
    }
  }

  sizeAdjust = Math.floor(sizeAdjust) + palette_bytes;

  let compressedSize = buffer.length + sizeAdjust;
  let compressedPct = compressedSize / buffer.length * 100;


  fs.writeFileSync(logFile, `
  palette entries: ${sortedArray.length}
  palette bytes: ${palette_bytes}`);
  fs.appendFileSync(logFile, `
  original size: ${buffer.length}
  singles: ${singleCount}
  duplicates: ${dupCount}
  total: ${singleCount + dupCount}
  size adjust: ${sizeAdjust}
  compressed size: ${compressedSize}
  compressed %: ${compressedPct}
  `);

  let appendString = '';
  let index = 0;

  sortedArray.forEach(p => {
    appendString +=
      `
      ${(++index).toString(10).padStart(5, ' ')}.) 0x${p.palette.toString(16).padStart(8, '0')}: ${p.count}`;
  });

  fs.appendFileSync(logFile, appendString);

}

function alphaClip(data, clipValue) {
  let buffer = data;
  let len = data.length;
  for (let i = 0; i < len; i += 4) {

    let dataVal; // = buffer.readUInt32BE(i);
    if (buffer.readUInt32BE) {
      dataVal = buffer.readUInt32BE(i);
    }
    else {
      dataVal = buffer[i >>> 2];
    }

    if ((dataVal & 0xff) <= clipValue) {
      // 0 out a pixel with an alpha value lower than clip
      buffer.writeUInt32BE(0, i);
    }

  }

  return data;

}

function colorReplace(data, initialColor, replaceColor) {
  initialColor = parseInt(initialColor, 16);
  replaceColor = parseInt(replaceColor, 16);

  let buffer = data;
  let len = data.length;
  for (let i = 0; i < len; i += 4) {

    let dataVal; // = buffer.readUInt32BE(i);
    if (buffer.readUInt32BE) {
      dataVal = buffer.readUInt32BE(i);
    }
    else {
      dataVal = buffer[i >>> 2];
    }

    if (dataVal === initialColor) {
      buffer.writeUInt32BE(replaceColor, i);
    }

  }

  return data;
}

function splitColor(color) {
  let red = color >>> 24;
  let green = (color >>> 16) & 0xff;
  let blue = (color >>> 8) & 0xff;
  let alpha = (color >>> 0) & 0xff;
  return [red, green, blue, alpha];
}

function reduceByPalette(data, paletteSize, blend) {
  const buffer = data; //, { encoding: "binary" });
  const m = new Map();
  const replaceMap = new Map();
  const replaceIndexMap = new Map();
  let len = buffer.length;

  for (let i = 0; i < len; i += 4) {
    //console.log(`i: ${i}`)
    let dataVal = buffer.readUInt32BE(i);
    if (dataVal & 0xff === 0 && dataVal !== 0) {
      dataVal = 0;
      buffer.writeUInt32BE(dataVal, i);
    }
    let mapVal = m.get(dataVal);

    if (mapVal == null) {
      m.set(dataVal, 1);
    }
    else {
      m.set(dataVal, mapVal + 1);
    }
  }

  let sortedArray = [];
  let singleCount = 0;
  let dupCount = 0;
  let palette_bytes = 0;


  for (let [key, value] of m.entries()) {
    palette_bytes += 4;
    dupCount += value;
    sortedArray.push({
      palette: key,
      count: value
    })
  }


  sortedArray.sort((a, b) => {
    return b.count - a.count;
  });

  for (let i = 0; i < sortedArray.length; i++) {
    sortedArray[i].index = i;
  }


  for (let i = 0; i < paletteSize; i++) {
    let initialValue = sortedArray[i].palette;
    replaceMap.set(initialValue, initialValue);
  }

  for (let i = paletteSize; i < sortedArray.length; i++) {
    let leastSquareDist = 0x1fffffff;
    let initialValue = sortedArray[i].palette;
    let [iRed, iGreen, iBlue, iAlpha] = splitColor(initialValue)

    for (r = 0; r < paletteSize; r++) {
      let replaceValue = sortedArray[r].palette;
      let [rRed, rGreen, rBlue, rAlpha] = splitColor(replaceValue)

      // I could have a configurable color penalty
      let lsq = (iRed - rRed) * (iRed - rRed) +
        (iGreen - rGreen) * (iGreen - rGreen) +
        (iBlue - rBlue) * (iBlue - rBlue) +
        (iAlpha - rAlpha) * (iAlpha - rAlpha);

      if (lsq < leastSquareDist) {
        leastSquareDist = lsq;
        replaceMap.set(initialValue, replaceValue);
        replaceIndexMap.set(initialValue, r);
      }
    }

  }
  // Blend the palette weighted by the number of occurrences.
  if (blend) {
    let blendArray = JSON.parse(JSON.stringify(sortedArray.slice(0, paletteSize)));
    for (let i = paletteSize; i < sortedArray.length; i++) {
      let pe = sortedArray[i];
      let bi = replaceIndexMap.get(pe.palette);
      let bCount = blendArray[bi].count;
      let pCount = pe.count;
      let countTotal = bCount + pCount;
      let [bRed, bGreen, bBlue, bAlpha] = splitColor(blendArray[bi].palette);
      let [pRed, pGreen, pBlue, pAlpha] = splitColor(pe.palette);

      let cr = Math.round((bRed * bCount + pRed * pCount) / countTotal) & 0xff;
      let cg = Math.round((bGreen * bCount + pGreen * pCount) / countTotal) & 0xff;
      let cb = Math.round((bBlue * bCount + pBlue * pCount) / countTotal) & 0xff;
      let ca = Math.round((bAlpha * bCount + pAlpha * pCount) / countTotal) & 0xff;

      blendArray[bi].count = countTotal;
      blendArray[bi].palette = (cr << 24) | (cg << 16) | (cb << 8) | ca;
      //console.log(`blendArray[bi].palette: 0x${blendArray[bi].palette.toString(16)}`)
    }

    for (let i = 0; i < paletteSize; i++) {
      let initialColor = sortedArray[i].palette >>> 0;
      let blendedColor = blendArray[i].palette >>> 0;
      replaceMap.set(initialColor, blendedColor);
    }

    for (let [key, value] of replaceMap.entries()) {
      let redirect = replaceMap.get(value);

      if (redirect != null) {
        replaceMap.set(key, redirect);
      }
    }

  }

  for (i = 0; i < len; i += 4) {
    let dataVal = buffer.readUInt32BE(i) >>> 0;
    if ((dataVal & 0xff) === 0 && dataVal !== 0) {
      buffer.writeUInt32BE(0, i);
      continue;
    }

    let replaceColor = replaceMap.get(dataVal);

    if (replaceColor != null) {
      //console.log(`replaceColor: ${replaceColor.toString(16)}`);
      buffer.writeUInt32BE(replaceColor, i);
    }
    else {
      console.log(`NO REPLACE COLOR for 0x${dataVal.toString(16)}`);
    }
  }
  return buffer;
}

function reduceByThreshold(data, tolerance) {
  const toleranceShift = Math.ceil(Math.log2(tolerance));
  const buffer = data; //, { encoding: "binary" });
  const m = new Map();

  let len = buffer.length;
  for (let i = 0; i < len; i += 4) {
    //console.log(`i: ${i}`)
    let dataVal = buffer.readUInt32BE(i);
    let mapVal = m.get(dataVal);

    if (mapVal == null) {
      m.set(dataVal, 1);
    }
    else {
      m.set(dataVal, mapVal + 1);
    }
  }

  let sortedArray = [];
  let singleCount = 0;
  let dupCount = 0;
  let palette_bytes = 0;


  for (let [key, value] of m.entries()) {
    if (value > 4) {
      palette_bytes += 4;
      dupCount += value;
      sortedArray.push({
        palette: key,
        count: value
      })
    }
    else {
      singleCount++;
    }
  }


  sortedArray.sort((a, b) => {
    return b.count - a.count;
  });

  for (let i = 0; i < sortedArray.length; i++) {
    findCloseColor(sortedArray[i], toleranceShift, tolerance)
  }


  outArray = new Uint32Array(buffer.length >>> 2)


  for (let i = 0; i < buffer.length; i += 4) {
    let color = buffer.readUInt32BE(i) | 0;
    outArray[i >>> 2] = findCloseColor(color, toleranceShift, tolerance);
  }

  for (let i = 0; i < buffer.length; i++) {
    let pixel = outArray[i >>> 2]
    buffer[i] = (pixel >>> (8 * (3 - (i % 4)))) & 0xff;
  }
  return buffer;
}


module.exports.colorReduce = function (fileName, flags) {
  let outFile = fileName.replace('.png', '.reduced.png');
  let data = null;
  try {
    data = fs.readFileSync(fileName);
  }
  catch (err) {
    console.log(`
    ${RED}Input file ${fileName} does not exist.${WHITE}
    `);
    return;
  }
  let pngInfo = PNG.sync.read(data);
  /*
  console.log(`
  width: ${pngInfo.width}
  height: ${pngInfo.height}
  `);
  */

  if (flags.configFile != null) {
    let config = JSON.parse(fs.readFileSync(flags.configFile))
    flags = Object.assign(flags, config);
  }

  if (flags.analyze != null) {
    let log_file = flags.analyze;
    analyze(pngInfo, log_file);
  }


  if (flags.outFile != null) {
    outFile = flags.outFile;
  }

  if (flags.maxPalette != null) {
    if (flags.tolerance) {
      console.log(`${YELLOW}
       ________________________________________________________________________________
      |                                                                                |
      | -max-palette flag is used instead of -tolerance flag.  You can not use both.   |
      |________________________________________________________________________________|
      ${WHITE}`);
    }
    pngInfo.data = reduceByPalette(pngInfo.data, flags.maxPalette, !!flags.blendPalette);
  }
  else if (flags.tolerance != null) {
    pngInfo.data = reduceByThreshold(pngInfo.data, flags.tolerance);
  }

  if (flags.alphaClip >= 1) {  // 249
    pngInfo.data = alphaClip(pngInfo.data, flags.alphaClip);
  }

  if (flags.replace != null && flags.replace.length > 0) {
    for (let i = 0; i < flags.replace.length; i++) {
      let replace = flags.replace[i];
      pngInfo.data = colorReplace(pngInfo.data, replace.initialColor, replace.replaceColor);
    }
  }


  if (flags.postAnalysis != null) {
    let log_file = flags.postAnalysis;
    analyze(pngInfo, log_file);
  }

  // REMOVE THIS LINE
  // THIS WAS FOR CROPPING RESEARCH
  let halfHeight = Math.floor(pngInfo.height / 2);
  let halfBytes = halfHeight * pngInfo.width * 4;
  /*
  let bufCopy = new ArrayBuffer(halfBytes);
  console.log(`
  bufCopy.byteLength: ${bufCopy.byteLength}
  halfBytes: ${halfBytes}
  Uint8Array(1): ${new Uint8Array(pngInfo.data, 0, 10)}
  `)
  //   Uint8Array(2): ${new Uint8Array(pngInfo.data, halfBytes, 10)}

  new Uint8Array(bufCopy).set(new Uint8Array(pngInfo.data, halfBytes, halfBytes), 0);
  //  new Uint8Array(pngInfo.data).set(new Uint8Array(bufCopy, 0, halfBytes));
  pngInfo.data.set(bufCopy);
  */
  //pngInfo.data = new Uint8Array(pngInfo.data).copyWithin(0, halfBytes);

  //pngInfo.height = halfHeight;
  //====================== CROP LEFT =========================
  /*
  const cropWidth = 50;
  const newWidth = pngInfo.width - cropWidth;
  for (let i = 0; i < pngInfo.height * 4; i++) {
    pngInfo.data = new Uint8Array(pngInfo.data).copyWithin(i * newWidth * 4, i * newWidth * 4 + cropWidth * 4);
  }
  pngInfo.width = newWidth;
  */
  // ====================== CROP RIGHT =========================
  /*
  const cropWidth = 50;
  const newWidth = pngInfo.width - cropWidth;
  for (let i = 0; i <= pngInfo.height * 4; i++) {
    pngInfo.data = new Uint8Array(pngInfo.data).copyWithin(
      i * pngInfo.width * 4 + cropWidth * 4,
      i * pngInfo.width * 4,
      (i + 1) * pngInfo.width * 4 - cropWidth * 4);
  }

  for (let i = 0; i < pngInfo.height * 4; i++) {
    pngInfo.data = new Uint8Array(pngInfo.data).copyWithin(i * newWidth * 4, i * newWidth * 4 + cropWidth * 4);
  }

  pngInfo.width = newWidth;
  */
  // ====================== CROP TOP =========================
  var cropHeight = 0;
  var pixelData = new Uint32Array(pngInfo.data);
  done:
  for (let i = 0; i < pngInfo.height; i++) {
    cropHeight = i;
    for (let j = 0; j < pngInfo.width; j++) {
      let index = (i * pngInfo.width + j) * 4;
      console.log(`
      pixelData[${index}]: 0x${pixelData[index].toString(16)}
      `)
      if ((pixelData[index] & 0xff) > 0) {
        break done;
      }
    }
  }

  for (let i = 0; i < pngInfo.height - cropHeight; i++) {
    pngInfo.data = new Uint8Array(pngInfo.data).copyWithin(
      i * pngInfo.width * 4,
      (i + cropHeight) * pngInfo.width * 4,
      (i + cropHeight + 1) * pngInfo.width * 4);
  }
  pngInfo.height = pngInfo.height - cropHeight;
  // ===========================================================
  let outBuffer = PNG.sync.write(pngInfo);
  fs.writeFileSync(outFile, outBuffer);

  /*
var dst = new ArrayBuffer(src.byteLength);
    new Uint8Array(dst).set(new Uint8Array(src));
    return dst;
  */

  if (flags.webp) {
    const webp = require('webp-converter');
    let webpFlags = "-lossless -z 9 -q 100 -progress -alpha_q 75";

    const result = webp.cwebp(outFile,
      outFile.replace(".png", ".webp"),
      webpFlags,
    );
    result.then((response) => {
      console.log(response);
    });
  }
}

module.exports.log_help = function () {
  console.log(
    `
    ${YELLOW}-analyze logfile.txt${WHITE} - analyze a .png file and write results to logfile.txt
    ${YELLOW}-post-analysis logfile.txt${WHITE} - analyze the output of color reduce and write to logfile.txt
    ${YELLOW}-max-palette <target>${WHITE} - set a target number of palette entries
    ${YELLOW}-tolerance <target>${WHITE} - set a target tolerance where similar colors within tolorance are reduced to a single color
    ${YELLOW}-blend-palette${WHITE} - rather than dropping colors, similar colors are blended
    ${YELLOW}-alpha-clip${WHITE} - reduce colors with similar alpha values
    ${YELLOW}-o out.png${WHITE} - sets the name of the output file to out.png
    ${YELLOW}-config config.json${WHITE} - use the config.json for settings
    ${WHITE}`);
}

module.exports.log_support = function () {
  console.log(
    CYAN,
    `
  Need help?  
  Contact Rick Battagline
  Twitter: @battagline
  https://wasmbook.com
  `);
}
