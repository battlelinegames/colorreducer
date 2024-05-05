const CYAN = '\x1b[36m'
const RED = '\x1b[31m';
const WHITE = '\x1b[37m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

const fs = require('fs');
const { PNG } = require('pngjs');
const tf = require('@tensorflow/tfjs');
({ countColors } = require('../src/colorCount.js'));

const HIDE_COLOR = 3_999_696_999;

function loadImage(filePath) {
    const data = fs.readFileSync(filePath);
    return PNG.sync.read(data);
}

function print(text) {
    console.log(text.split('\n')
                .map(line => line.trimStart())  // Use trimStart() to only remove leading whitespace
                .join('\n'));
}

async function kMeansClustering(data, k, maxIterations, batchSize) {
    let centroids = initializeCentroids(data, k);
    let seconds = 0;

    let assignments = tf.zeros([data.shape[0]], 'int32');
    //updateProgressBar(0, maxIterations, "K-Means Clustering");
    const startTime = new Date();

    for (let i = 0; i < maxIterations; i++) {
        const iterationStartTime = new Date();
        print(`${YELLOW}
        _______________________________

        Iteration ${i + 1}
        _______________________________
        ${WHITE}
        Updating Centroids...
        `);
        const prevAssignments = assignments;
        const centroidStartTime = new Date();
        centroids = await updateCentroids(data, assignments, k);
        seconds = (new Date() - centroidStartTime)/1000;
        print(`${GREEN}
        ____________________________________________
    
        Centroid time: ${seconds.toFixed(2)} seconds
        ____________________________________________
        ${WHITE}
        Clustering...
        `);
    
        const clusterStartTime = new Date();
        assignments = assignClustersBatched(data, centroids, batchSize);
        seconds = (new Date() - clusterStartTime)/1000;

        print(`${BLUE}
        ____________________________________________
    
        Cluster time: ${seconds.toFixed(2)} seconds
        ____________________________________________
        ${WHITE}
        `);
        

        // check if the total cost is less than the tolerance
        updateProgressBar(i, maxIterations, "K-Means Clustering");
    }

    return { centroids, assignments };
}

function initializeCentroids(data, k) {
    // Generate random indices and shuffle them
    const indices = tf.util.createShuffledIndices(data.shape[0]);

    // this was a work around because I was getting a strange rrror from the original code
    const indexSlice = Array.from(indices.slice(0, k));

    // indexSlice was producing an array of floats.  The next two lines convert to integers
    const integerIndices = indexSlice.map(index => Math.floor(index) | 0);
    const uniqueIndices = tf.tensor(integerIndices).toInt();

    // extract points from data using uniqueIndices
    return tf.gather(data, uniqueIndices);
}

function assignClustersBatched(data, centroids, batchSize) {
    const startTime = new Date();
    print(`${GREEN}
    _______________________________

    Assigning Clusters
    _______________________________
    ${WHITE}
    `);
    return tf.tidy(() => {
    const numPoints = data.shape[0]; // Number of data points is the first dimension of 'data'
    updateProgressBar(0, numPoints, "Assigning Clusters")
    let assignments = new Array(numPoints);  // Array to store the cluster assignments

    // Process each batch
    for (let i = 0; i < numPoints; i += batchSize) {
        // Determine the end index of the current batch
        try {
            updateProgressBar(i, numPoints, "Assigning Clusters")
        }
        catch(err) {
            console.log(err);
            print(`
            i: ${i}
            batchSize: ${batchSize}
            numPoints: ${numPoints}
            Math.floor(i / batchSize): ${Math.floor(i / batchSize) | 0}
            `);
        }
        const end = Math.min(i + batchSize, numPoints);
        // Extract the current batch from the data
        const dataBatch = data.slice([i, 0], [end - i, data.shape[1]]);

        // Broadcast data batch against all centroids
        const expandedDataBatch = dataBatch.expandDims(1); // Shape [batchSize, 1, numFeatures]
        const expandedCentroids = centroids.expandDims(0); // Shape [1, numCentroids, numFeatures]

        // Compute squared differences from each point to each centroid
        const sqDiff = tf.squaredDifference(expandedDataBatch, expandedCentroids);
        // The colors are in RGBA format, so we sum along the last axis (axis=2) to get the squared Euclidean distance
        const distances = sqDiff.sum(2); // Shape [batchSize, numCentroids]

        // Find the index the closest centroid for each point
        const batchAssignments = distances.argMin(1).arraySync();

        // Store assignments
        for (let j = 0; j < batchAssignments.length; j++) {
            assignments[i + j] = batchAssignments[j];
        }

        // Dispose tensors to free memory (possibly remove)
        expandedDataBatch.dispose();
        distances.dispose();
        sqDiff.dispose();
    }
    seconds = (new Date() - startTime) / 1000;
    print(`${YELLOW}
    _______________________________

    Cluster Time: ${seconds.toFixed(2)} seconds
    _______________________________
    ${WHITE}
    `);

    // return the assignments as a 1D tensor
    return tf.tensor1d(assignments, 'int32');
    });
}

async function updateCentroids(data, assignments, k) {
    const newCentroids = [];
    updateProgressBar(0, k, "Updating Centroids")

    for (let i = 0; i < k; i++) {
        // Create a boolean mask where each 'true' represents a data point assigned to the current cluster
        updateProgressBar(i, k, "Updating Centroids")
        const mask = assignments.equal(i);

        // Use the boolean mask to directly extract rows from 'data'
        const pointsAssignedToCluster = await tf.booleanMaskAsync(data, mask);
        /*
        console.log(`
        pointsAssignedToCluster: ${pointsAssignedToCluster.shape}
        `);
        */
        //mask.dispose();

        // Check if any points have been assigned to this cluster to avoid errors in mean calculation
        if (pointsAssignedToCluster.shape[0] > 0) {
            // Calculate the mean of the points assigned to the cluster
            const mean = pointsAssignedToCluster.mean(0);

            // Push the mean to the new centroids array
            newCentroids.push(mean);
            //mean.dispose();
        } else {
            // Handle the case where no points are assigned to the cluster
            // Here, we simply reuse the previous centroid (if available) or use a random point from the data
            // This is a part of handling empty clusters in K-means
            const randomIndex = tf.randomUniform([], 0, data.shape[0], 'int32');
        
            // Gather a random point from the data
            const randomPoint = data.gather(randomIndex);

            // Push the random point to the new centroids array
            newCentroids.push(randomPoint);
        }
    }

    const stackedCentroids = tf.stack(newCentroids);

    // Stack all the new centroids into a single tensor
    return stackedCentroids;
}

module.exports.reduceColors = async (image_file, color_count, iterations, batch_size, save_png) => {
    const startTime = new Date();

    // Create a color map
    color_count = parseInt(color_count, 10);
    let outFile = image_file.replace('.png', '.temp.png');
    let webpFile = image_file.replace('.png', '.webp');

    const pngInfo = loadImage(image_file);
    const testTime = new Date() - startTime;

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

    //const { centroids, assignments } = await kmeans(colorData, color_count);
    const { centroids, assignments } = await kMeansClustering(colorData, color_count, iterations, batch_size);

    const gatheredColors = tf.gather(centroids, assignments);

    let newColors = gatheredColors.reshape([pngInfo.height, pngInfo.width, 4]);
    let finalImageData = tf.cast(newColors, 'int32');

    //pngInfo.data = Buffer.from(newColors.dataSync());
    if( color_count <= 256 ) {
        pngInfo.palette = true;
    }
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
        print(`
        webp response:
        `);
        console.log(response);
        if( save_png === false ) {
            fs.unlinkSync(outFile);
        }
        else {
            console.log(`writing PNG file: ${outFile}`);
        }
    });

    let count = countColors(outFile);
    console.log(`${CYAN}
    _______________________________

    WebP colors: ${count}
    _______________________________
    ${WHITE}`);

    const totalTime = new Date() - startTime;
    let seconds = Math.floor(totalTime / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    print(`${YELLOW}
    Time: ${hours}:${minutes}:${seconds}
    Total seconds: ${totalTime/1000}
    ${WHITE}
    `);
}
module.exports.logSupport = function () {
    print(`${CYAN}
    Need help?  
    Contact Rick Battagline
    Email: rick@battagline.com
    Twitter/X: @battagline
    https://wasmbook.com
    ${WHITE}`);
  }
  
  module.exports.logHelp = function () {
    print(`${CYAN}
    Usage: rc <image_file> <color_count>
    Optional parameters:
    -f=<image_file>
    --file=<image_file>
    -c=<color_count>
    --color_count=<color_count>
    -b=<batch_size>
    --batch_size=<batch_size>
    -i=<iterations>
    --iterations=<iterations>
    --savepng
    -h 
    --help

    Note: 
    -b increasing the batch size can speed up the process, but will consume more memory
    -i increasing the iterations will increase the accuracy of the color reduction

    Default values:
    batch size: 100_000
    iterations: 10
    color count: 256
    ${WHITE}`);
  }

  function updateProgressBar(currentStep, totalSteps, title="Progress", currentUniqueColorCount = -1) {
    const progressBarLength = 25; // Length of the progress bar in characters
    const percentage = (currentStep / totalSteps); // Current completion percentage
    const filledLength = Math.round(progressBarLength * percentage); // How many characters should be filled
    const bar = '█'.repeat(filledLength) + '-'.repeat(progressBarLength - filledLength); // Creates the bar
    if( currentUniqueColorCount >= 0 ) {
      process.stdout.write(`\r${title}: [${bar}] ${Math.round(percentage * 100)}% | Colors: ${currentUniqueColorCount}`); // Writes the bar
    }
    else {
      process.stdout.write(`\r${title}: [${bar}] ${Math.round(percentage * 100)}% `); // Writes the bar
    }
}

