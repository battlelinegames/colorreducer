# Color Reducer (for WebP)
This is a color reduction tool for lowering the number of colors of a .png file and optionally saving it off as a .webp file.  While developing [cardtable.com](https://cardtable.com), I realized that many of the image files I was using for my sprite sheets/texture maps had more colors than were necessary to achieve the look I was going for.  This little app uses K-Means clustering to reduce the number of colors to an approximate number.  The number of colors will actually be lower than the selected color count.  The more iterations you run, the higher the final color count will be.  Running more iterations can take quite a bit of time.  You may want to target a higher number than you actually want if you do not have the time to run many iterations. 

## Why reduce colors?

Using WebP in combination with color reduction can greatly reduce the size of your image file.  If you are using PNG as your file format, the size difference between PNG8 and PNG24 can be significant.  In certain games that have a classic aesthetic, 256 colors can be more than adequate and create a significant improvement in file size.  At this point, this script does not save PNG8 files, but may in the future.


## Performance problems

I'd like to note that this version of **Color Reducer** uses the CPU and not the GPU.  I wasn't able to get CUDA working with Node.js for some reason.  At one point I had a Python version that was a lot faster because it was using the GPU, but when I lost the code for that, I decided to rewrite it in Node.js so that I could put out an NPM package.  I'm not sure why I didn't check the Python version into GitHub, but I didn't :frowning:

### Installation

Please install this package globally to use at the command line:
```bash
npm i colorreducer -g
```

This will allow you to run the `rc` (reduce color) command.

### Usage

`rc` command minimal usage:
```
rc ImageFile.png
```

Using the `rc` command in the way shown above uses the default for most of the parameters.  By default the rc command will reduce the image to a color count of approximately 256 using a batch size of 100K with 10 clustering iterations.  Just running this 

```
rc ImageFile.png 128
```

In the above usage, the argument `128` is used to override the target color count of 256 setting the target color count to 128.


```
rc ImageFile.png -b=500k
```

In the above example, `-b=500k` changes the batch size to 500,000.  This will improve performance, but increase the amount of memory used by the color reducer.  Setting this value too high could result in a memory error as the color reducer may attempt to use more memory than is available.

```
rc ImageFile.png -i=50
```

In the above example, `i=50` will override the default number of iterations from 10 to 50.  This will take quite a bit longer as the clustering is occurring on the CPU, but will result in more accurate color clusters.  It will, however, also result in more colors not less.  This is a quirk related to how K-Means clustering works.  The algorithm is trying to group all the colors in the image by centroid colors, starting with randomly chosen centroids.  Some of the randomly chosen centroids will result in no pixels being assigned to them and new random centroids will need to be generated.  If you start with 256 centroids and only have one or two iterations, you may have a file with only 230 colors.

Here are all optional parameters:
```
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
```

# Who is this for

Primarily it is for me (Rick Battagline) and any other web game developers out there who are looking to reduce the size of their image files.  I'm using this on my Sprite Sheets and Texture Maps to improve the start up times for my webgames.

[cardtable.com](https://cardtable.com)
[classicsolitaire.com](https://classicsolitaire.com)
[wasmbook.com](https://wasmbook.com)