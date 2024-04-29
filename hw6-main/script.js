
function handleGammaChange() {
    const gamma = parseFloat(document.getElementById('gammaInput').value);
    document.getElementById('gammaValue').textContent = gamma.toFixed(1);
    reloadImageWithGamma(gamma);
}

// func to reload the image with the new gamma value
function reloadImageWithGamma(gamma) {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const filterSize = parseInt(document.getElementById('filterSizeInput').value);

    const reader = new FileReader();
    reader.onload = function(event) {
        const buffer = event.target.result;
        const img = parseHdr(buffer);
        if (img) {
            console.log('Image shape:', img.shape);
            console.log('Exposure:', img.exposure);
            console.log('Gamma:', img.gamma);
            console.log('First pixel data:', img.data[1]); // Example data access

            // do tone mapping
            // const scaledData = applyToneMapping(img.data, gamma);
            const scaledData = applyToneMappingWithBilateral(img.data, gamma, filterSize, img.shape[0], img.shape[1]);

            // put the image on canvas
            displayImage(img.shape, scaledData);
        } else {
            console.error('Error parsing HDR data.');
        }
    };
    reader.readAsArrayBuffer(file);
}
// func to handle filter size change
function handleFilterSizeChange() {
    const filterSize = parseInt(document.getElementById('filterSizeInput').value);
    document.getElementById('filterSizeValue').textContent = filterSize;
    reloadImageWithFilterSize(filterSize);
}

// func to reload the image with the new filterSize value
function reloadImageWithFilterSize(filterSize) {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const gamma = parseFloat(document.getElementById('gammaInput').value);

    const reader = new FileReader();
    reader.onload = function(event) {
        const buffer = event.target.result;
        const img = parseHdr(buffer);
        if (img) {
            
            // do tone mapping
            const scaledData = applyToneMappingWithBilateral(img.data, gamma, filterSize, img.shape[0], img.shape[1]);

            // dis the image on canvas
            displayImage(img.shape, scaledData);
        } else {
            console.error('Error parsing HDR data.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function handleFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    const reader = new FileReader();
    reader.onload = function(event) {
        const buffer = event.target.result;
        const img = parseHdr(buffer);
        if (img) {
            // t mapping parameters
            const gamma = parseFloat(document.getElementById('gammaInput').value);

            const filterSize = parseFloat(document.getElementById('filterSizeInput').value);
            // do tone mapping
            //const scaledData = applyToneMapping(img.data, gamma);
            const scaledData = applyToneMappingWithBilateral(img.data, gamma, filterSize, img.shape[0], img.shape[1]);
            // display the image on canvas
            displayImage(img.shape, scaledData);
        } else {
            console.error('Error parsing HDR data.');
        }
    };
    reader.readAsArrayBuffer(file);
}
//part 2 - simple
//apply tone mapping
// function applyToneMapping(data, gamma) {
//     const scaledData = [];
//     const pixelCount = data.length / 4;
//     for (let i = 0; i < pixelCount; i++) {
//         const offset = i * 4;
//         const R = data[offset];
//         const G = data[offset + 1];
//         const B = data[offset + 2];
//         // get luminance
//         const L = (1.0 / 61.0) * (20.0 * R + 40.0 * G + B);

//         // get target display luminance
//         const L_prime = Math.pow(L, gamma);

//         // get scale value
//         const scale = L_prime / L;

//         // update RGB values
//         const scaledR = clamp(R * scale);
//         const scaledG = clamp(G * scale);
//         const scaledB = clamp(B * scale);
//         scaledData.push(scaledR, scaledG, scaledB, data[offset + 3]); // Keep alpha channel unchanged
//     }
//     return scaledData;
// }

// data is picture data hdr
//gamma is val for gamma correction
//filter size for convolution 
//height / width are picture height width
function applyToneMappingWithBilateral(data, gamma, filterSize, width, height) {
    const scaledData = [];
    
    const pixelCount = data.length / 4;
    // compute l(L) log luminance for each pixel
    const logLuminance = [];
    for (let i = 0; i < pixelCount; i++) {
        const offset = i * 4;
        const R = data[offset];
        const G = data[offset + 1];
        const B = data[offset + 2];
        const L = (1.0 / 61.0) * (20.0 * R + 40.0 * G + B);
        logLuminance.push(Math.log(L + 1e-6)); // here i do 1e-6 to avoid log 0
    }
    // 1 B = log (L)⊗g
    const B = conv(logLuminance, width, height, filterSize);
    // 2 separate log(L) into high-pass S and low-pass B
    const S = [];
    for (let i = 0; i < logLuminance.length; i++) {
        S.push(logLuminance[i] - B[i]);
    }
    // 3 gamma correct B and recombine with s

    // here i choose to have a user defined gamma instead ofγ=log(c)/(max(B)−min(B)
    const logLp = [];
    for (let i = 0; i < B.length; i++) {
        logLp.push(gamma * B[i] + S[i]);
    }
    // 4 convert back from log space to original
    for (let i = 0; i < logLp.length; i++) {
        const L_prime = Math.exp(logLp[i]);

        //5
        const scale = L_prime / Math.exp(logLuminance[i]);
        const offset = i * 4;
        const R = clamp(data[offset] * scale);
        const G = clamp(data[offset + 1] * scale);
        const B = clamp(data[offset + 2] * scale);
        scaledData.push(R, G, B, data[offset + 3]); 
    }
    return scaledData;
}

//bilat filter func
function conv(data, width, height, filterSize) {
    const filteredData = [];
    const halfSize = Math.floor(filterSize / 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        let sum = 0;
        let weightSum = 0;
        for (let j = -halfSize; j <= halfSize; j++) {
          for (let i = -halfSize; i <= halfSize; i++) {
            const neighborX = x + i;
            const neighborY = y + j;
            if (neighborX >= 0 && neighborX < width && neighborY >= 0 && neighborY < height) {
              const neighborIndex = neighborY * width + neighborX;
              const distanceSq = i * i + j * j; //Euclidean distance
              // modify your convolution to produce a non-linear operator instead of a standard box filter.
              const weight = Math.exp(-distanceSq / (2 * 0.5 ** 2)); // Gaussian function - yeilds dec weight with increasing distance from the cur
              const intensityDiff = Math.abs(data[index] - data[neighborIndex]); // intensity difference
              const intensityWeight = Math.exp(-intensityDiff / (2 * 0.1 ** 2)); // Gaussian function func to decrease intensity difference with inc from cyr
              const totalWeight = weight * intensityWeight;
              sum += data[neighborIndex] * totalWeight; // add to sum - weighted acording to distance
              weightSum += totalWeight; // prevent changes in brighntess with this
            }
          }
        } 
        filteredData.push(sum / weightSum);
      }
    }
    return filteredData;
}

// func to clamp values between 0 and 1
function clamp(value) {
    return Math.min(1, Math.max(0, value));
}

// func to display the image on canvas
function displayImage(shape, data) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = shape[0];
    canvas.height = shape[1];
    const imageData = ctx.createImageData(shape[0], shape[1]);

    // set the pixel data
    for (let i = 0; i < data.length; i++) {
        imageData.data[i] = Math.round(data[i] * 255); // conver to 255
    }

    // image to canvas
    ctx.putImageData(imageData, 0, 0);
}
// func to save to ppm
function saveToPPM() {
    // get canvas element
    var canvas = document.getElementById("canvas");
    var ctx = canvas.getContext("2d");
    // get canvas image data
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = imageData.data;
    // make PPM file content
    var ppmData = "P3\n" + canvas.width + " " + canvas.height + "\n255\n";
    for (var i = 0; i < data.length; i += 4) {
        ppmData += data[i] + " " + data[i + 1] + " " + data[i + 2] + "\n";
    }
    // make Blob from PPM data
    var blob = new Blob([ppmData], { type: "text/plain" });
    // download link
    var link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = "canvas_image.ppm";
    link.click();
}