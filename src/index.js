const ConfigStore = require("configstore")
const { isFn, isFullStr, isObj, isBasicObj, isVoid, getInput } = require("./util")

module.exports = class Authorizer {
  constructor(settings){
    if (!isBasicObj(settings)) throw new Error("requires settings obj literal");
    const { getAuth, clearAuth, name } = settings;
    if (!isFn(getAuth)) throw new Error("settings require getAuth fn");
    if (!isFn(clearAuth)) throw new Error("settings require clearAuth fn");
    if (!isFullStr(name)) throw new Error("settings require non-empty name str");
    const props = settings.props || {
      username: {message: "Enter username"},
      password: {message: "Enter password", hidden: true}
    }
    if (!isBasicObj(props)) throw new Error("props setting must be obj literal");

    // private
    const config = new ConfigStore(name);
    const setConfig = c => config.set(c);
    const delConfig = c => c.forEach(k => config.delete(k))
    const refresh = (conf, isClear, cb) => {
      getInput(props, (err, creds) => {
        if (err) return cb(err);
        const job = isClear ? clearAuth : getAuth
        job(creds, conf, (err, res) => {
          if (err) return cb(err);
          if (!res) return refresh(conf, isClear, cb);
          (isClear ? delConfig : setConfig)(res);
          cb(null)
        })
      })
    }

    // public
    this.getConfig = () => Object.assign({}, config.all || {});
    this.ensure = req => {
      const conf = this.getConfig();
      req(conf, cb => refresh(conf, false, err => {
        err ? cb(err) : this.ensure(req)
      }))
    }
    this.revoke = cb => refresh(this.getConfig(), true, cb)
  }
  createProvider(store, onError){
    if (isVoid(onError)) onError = store, store = null;
    if (!isFn(onError)) throw new Error("requires onError fn");
    if (store && !isObj(store)) throw new Error("config store must be obj");

    return req => (...args) => {
      const cb = args[args.length-1];
      if (isFn(cb)) args = args.slice(0,-1);
      this.ensure((config, prompt) => {
        const updatedArgs = args.slice();
        if (store) store.config = config;
        else updatedArgs.unshift(config);
        req(...updatedArgs, (err, res) => {
          if (err || !res) return err ? onError(err) : prompt(onError);
          isFn(cb) && cb(res)
        })
      })
    }
  }
}
