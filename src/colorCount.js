const fs = require('fs');
const PNG = require('pngjs').PNG;

module.exports.countColors = function(filePath) {
    // Read the PNG file data synchronously
    const data = fs.readFileSync(filePath);
    const png = PNG.sync.read(data);
    const colorSet = new Set();

    // Iterate over each pixel and collect unique colors
    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2; // index in the pixel array
            const red = png.data[idx];
            const green = png.data[idx + 1];
            const blue = png.data[idx + 2];
            const alpha = png.data[idx + 3];
            const color = `${red}-${green}-${blue}-${alpha}`;
            colorSet.add(color);
        }
    }

    // Return the number of unique colors found
    return colorSet.size;
}
// Replace 'path_to_image.png' with the path to your PNG file
//countUniqueColors('path_to_image.png');
