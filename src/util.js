const prompt = require("prompt")

const isFn = fn => fn && typeof fn === "function"

const isFullStr = str => str && typeof str === "string" && str.trim();

const isObj = obj => obj && typeof obj === "object";

const isBasicObj = obj => isObj(obj) && toString.call(obj) === "[object Object]";

const isVoid = obj => typeof obj === "undefined";

const getInput = (properties, cb) => {
  prompt.start();
  prompt.message = "";
  prompt.get({properties}, (err, creds) => {
    if (err) return cb(err);
    cb(null, creds)
  })
}

module.exports = { isFn, isFullStr, isObj, isBasicObj, isVoid, getInput }
