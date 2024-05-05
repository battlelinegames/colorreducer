const CYAN = '\x1b[36m%s\x1b[37m'
const RED = '\x1b[31m';
const WHITE = '\x1b[37m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

const fs = require('fs');
const { PNG } = require('pngjs');
const tf = require('@tensorflow/tfjs');

const HIDE_COLOR = 3_999_696_999;

// Load an image
function loadImage(filePath) {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

async function computeBatchedDistances(data, centroids, batchSize = 100_000) {

  const numData = data.shape[0];
  let distances = [];

  updateProgressBar(0, numData, HIDE_COLOR);

  for (let startIdx = 0; startIdx < numData; startIdx += batchSize) {
      const endIdx = Math.min(startIdx + batchSize, numData);
      const dataBatch = data.slice([startIdx, 0], [endIdx - startIdx, -1]);

      // Expand data batch for broadcasting against centroids
      const expandedDataBatch = tf.expandDims(dataBatch, 1);
      const expandedCentroids = tf.expandDims(centroids, 0);

      const subtract = tf.sub(expandedDataBatch, centroids);
      const batchDistances = subtract.norm('euclidean', 2);

      distances.push(batchDistances);

      // Dispose tensors to free memory
      expandedDataBatch.dispose();
      expandedCentroids.dispose();

      updateProgressBar(startIdx, numData, HIDE_COLOR);
      // Optionally, show progress or debug info
  }

  // Concatenate results from all batches
  const finalDistances = tf.concat(distances, 0);
  distances.forEach(t => t.dispose()); // Clean up intermediate tensors

  return finalDistances;
}

async function convertRGBAToInt(centroids) {
  // Convert the centroids tensor to integers
    const centroidsInt = centroids.mul(tf.scalar(255)).toInt();

    // Pack RGBA components into a single integer
    return centroidsInt.array().then(centroidsArray => {
        return centroidsArray.map(centroid => {
            const [r, g, b, a] = centroid;
            // Shift and add each component
            return (r << 24) | (g << 16) | (b << 8) | a;
        });
    });
}

async function countUniqueIntColors(centroids) {
  const colors = await convertRGBAToInt(centroids);
  const uniqueColors = new Set(colors);
  return uniqueColors.size;
}

// I haven't been able to get my GPU working with TensorFlow.js, so I'm using the CPU
// I'm using asynchronous functions, wich are slow, but it doesn't make much of a 
// difference on the CPU.
async function initializeCentroids(colors, numClusters) {
  // Assume 'colors' is a tensor of shape [numPixels, 4] (RGBA)
  // Step 1: Compute the mean color of all colors
  return tf.tidy(() => {
    const meanColor = colors.mean(0);

    // Array to store the indices of the selected centroids
    let selectedIndices = [];

    // Array to store the selected centroids
    let centroids = [];

    for (let i = 0; i < numClusters; i++) {
      let currentMean;

        if (i === 0) {
            // For the first centroid, use the global mean
            currentMean = meanColor;
        } else {
            // Calculate the mean of already selected centroids
            let selectedCentroids = tf.gather(colors, selectedIndices);
            currentMean = selectedCentroids.mean(0);
        }

        // Calculate distances from the current mean
        let distances = colors.sub(currentMean.expandDims(0)).norm('euclidean', 1);

        // Avoid re-selecting the same color
        let maxDistance = tf.tensor(0);
        let selectedIndex;

        // Ensure that the new centroid is not one of the already chosen centroids
        distances.arraySync().forEach((dist, idx) => {
            if (!selectedIndices.includes(idx) && dist > maxDistance.arraySync()) {
                maxDistance = tf.tensor(dist);
                selectedIndex = idx;
            }
        });

        // Add the selected index and centroid to the respective arrays
        selectedIndices.push(selectedIndex);
        centroids.push(colors.slice([selectedIndex, 0], [1, 4]).arraySync()[0]);
        updateProgressBar(i, numClusters); // Update the progress bar

      }

      // Convert centroids to a tensor
      return tf.tensor(centroids);
  });
}

async function kmeans(inputData, numClusters, maxIter = 50) {
  const targetColors = numClusters;
  let centroids = await initializeCentroids(inputData, numClusters);
  centroids = centroids.reshape([1, numClusters, 4]);
  let expandedInputData = inputData.reshape([inputData.shape[0], 1, 4]);
  //let expandedCentroids = centroids.reshape([numClusters, 1, 4]);
  let assignments;
  let startingColors = await countUniqueIntColors(centroids);    
  console.log(`
  Starting with ${startingColors} unique colors
  `)

  for (let i = 0; i < maxIter; i++) {
    console.log('Iteration: ', i);
   let distances = await computeBatchedDistances(inputData, centroids);
   console.log(`
   batch distances computed
   `);
    
    assignments = distances.argMin(1);

    let newCentroids = tf.tidy(() => tf.stack(Array.from({length: numClusters}, (_, idx) => {
      // Create a boolean mask where assignments equal the current cluster index
      let mask = assignments.equal(idx).expandDims(1);

    // Broadcast the mask to the same shape as inputData
      let broadcastedMask = mask.tile([1, 4]);  // This duplicates the mask across the 4 color channels

      // Use broadcasting to zero out elements not belonging to the current cluster
      let maskedData = inputData.mul(broadcastedMask);

      // Sum the data points within each cluster (only non-zero values contribute to the sum)
      let sum = maskedData.sum(0);

      // Count how many data points were added to each cluster
      let count = mask.sum();

      // Compute the new centroids by dividing the sum by the count of data points
      return sum.div(count);
    })));

    //5,235,578,880
    let centroidChanges = newCentroids.sub(centroids).norm().dataSync();

    centroids = newCentroids;
    
    let currentUniqueColorCount = await countUniqueIntColors(newCentroids);    
    updateProgressBar(maxIter, maxIter, currentUniqueColorCount); // Update the progress bar
    if (currentUniqueColorCount <= targetColors ) {
      console.log(`
      
      Convergence reached based on unique color count at iteration ${i}
      
      `);
      break;
    }    
    
    if (centroidChanges < 1e-5) {
      console.log(`
      
      Convergence reached at iteration ${i}
      
      `);
      break;
    }

  }
  return { centroids: centroids.arraySync(), assignments: assignments.arraySync() };
}

module.exports.reduceColors = async function(image_file, color_count) {
    // Create a color map
    debugger;
    color_count = parseInt(color_count, 10);
    let outFile = image_file.replace('.png', '.reduced.png');
    let webpFile = image_file.replace('.png', '.webp');

    const pngInfo = loadImage(image_file);

    for (let i = 0; i < pngInfo.data.length; i += 4) {
      // The data array stores pixel values in RGBA order
      const r = pngInfo.data[i];
      const g = pngInfo.data[i + 1];
      const b = pngInfo.data[i + 2];
      const alpha = pngInfo.data[i + 3];
  
      // Check if the alpha value is 0
      if (alpha === 0) {
          // Set R, G, and B values to 0
          pngInfo.data[i] = 0;      // Red
          pngInfo.data[i + 1] = 0;  // Green
          pngInfo.data[i + 2] = 0;  // Blue
      }
    }

    let colors = tf.tensor(pngInfo.data, [pngInfo.width * pngInfo.height, 4]);
    let colorData = tf.cast(colors, 'float32')

    console.log(`
    Reducing colors in ${image_file} to ${color_count} colors
    `);
    const { centroids, assignments } = await kmeans(colorData, color_count);
    let newColors = tf.gather(tf.tensor(centroids), assignments).reshape([pngInfo.height, pngInfo.width, 4]);
    let finalImageData = tf.cast(newColors, 'int32');

    //pngInfo.data = Buffer.from(newColors.dataSync());
    pngInfo.data = Buffer.from(finalImageData.dataSync());
    let outBuffer = PNG.sync.write(pngInfo);
    fs.writeFileSync(outFile, outBuffer);
    
    const webp = require('webp-converter');
    let webpFlags = "-lossless -z 9 -q 100 -progress -alpha_q 75";
    
    const webp_result = webp.cwebp(outFile,
        webpFile,
        webpFlags,
    );
    
    webp_result.then((response) => {
        console.log(response);
    });
    
}

  module.exports.logSupport = function () {
    console.log(
      CYAN,
      `
    Need help?  
    Contact Rick Battagline
    Twitter: @battagline
    https://wasmbook.com
    `);
  }
  
  module.exports.logHelp = function () {
    console.log(
        CYAN,
        `
    Usage: kcolor <image_file> <color_count>
    `);
  }

  function updateProgressBar(currentStep, totalSteps, currentUniqueColorCount = -1) {
    const progressBarLength = 25; // Length of the progress bar in characters
    const percentage = (currentStep / totalSteps); // Current completion percentage
    const filledLength = Math.round(progressBarLength * percentage); // How many characters should be filled
    const bar = '█'.repeat(filledLength) + '-'.repeat(progressBarLength - filledLength); // Creates the bar
    if( currentUniqueColorCount === HIDE_COLOR) {
      process.stdout.write(`\rProgress: [${bar}] ${Math.round(percentage * 100)}%`); // Writes the bar
    }
    else if( currentUniqueColorCount >= 0 ) {
      process.stdout.write(`\rProgress: [${bar}] ${Math.round(percentage * 100)}% | Colors: ${currentUniqueColorCount}`); // Writes the bar
    }
    else {
      process.stdout.write(`\rInitializing: [${bar}] ${Math.round(percentage * 100)}% `); // Writes the bar
    }
}

