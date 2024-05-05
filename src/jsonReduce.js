const fs = require('fs');

// I NEED TO TRANSFORM THIS TO USE WEBGL FRAME LOCATIONS

module.exports.jsonReduce = function (fileName, flags) {
  let outFile = fileName.replace('.json', '.reduced.json');
  let data = fs.readFileSync(fileName);
  let jsonObj = JSON.parse(data);
  let frames = jsonObj.frames;
  let size = jsonObj.meta.size;

  let frameList = [];
  /*
  for (frameName in frames) {
    let obj = {
      name: frameName.replace('.png', '').replace('.psd', ''),
      x: ((frames[frameName].frame.x / size.w) * 2.0 - 1.0).toFixed(6),
      y: (1.0 - (frames[frameName].frame.y / size.h) * 2.0).toFixed(6),
      w: ((frames[frameName].frame.w / size.w) * 2.0).toFixed(6),
      h: ((frames[frameName].frame.h / size.h) * 2.0).toFixed(6),
    }
    frameList.push(obj);
  }
  */

  for (frameName in frames) {
    let obj = {
      n: frameName.replace('.png', '').replace('.psd', ''),
      x: frames[frameName].frame.x,
      y: frames[frameName].frame.y,
      w: frames[frameName].frame.w,
      h: frames[frameName].frame.h,
    }
    frameList.push(obj);
  }
  let groups = null;
  let groupList = [];

  if (flags.configFile != null) {
    let configData = fs.readFileSync(flags.configFile);
    let configJSON = JSON.parse(configData);
    for (let i = 0; i < configJSON.groups.length; i++) {
      if (groups == null) groups = [];

      let group = configJSON.groups[i];
      let name = group.n;
      let matchArray = group.match;
      for (let m = 0; m < matchArray.length; m++) {
        if (groupList[name] == null) {
          groupList[name] = [];
        }
        let matchRegex = new RegExp(matchArray[m]);
        for (let f = 0; f < frameList.length; f++) {
          let frame = frameList[f];
          if (frame.n.match(matchRegex)) {
            groupList[name].push(frame);
            frameList.splice(f, 1);
            f--;
          }
        }
      }
    }
  }

  let outObj = Object.assign({
    size: size,
    frames: frameList
  }, groupList);

  fs.writeFileSync(outFile, JSON.stringify(outObj), { encoding: "utf8" });
}