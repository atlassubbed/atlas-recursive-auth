const { describe, it } = require("mocha")
const { expect } = require("chai")
const rewire = require("rewire");

const Authorizer = rewire("../src/index");
const Util = rewire("../src/util");

// could use a DRYer wrapper; a better mocking framework.
// could also benefit from sinon-chai

let revert;

describe("recursive authorizer", function(){

  beforeEach(function(){
    revert && revert();
  })

  describe("instantiation", function(){
    it("should throw error if not passed settings", function(){
      expect(() => new Authorizer()).to.throw("requires settings obj")
    })
    it("should throw error if passed invalid settings", function(){
      const invalid = [null, NaN, undefined, true, 22/7, 4, () => {}, /reg/, new Date(), "str", "    \n   ", ""]
      invalid.forEach(s => {
        expect(() => new Authorizer(s)).to.throw("requires settings obj literal")
      })
    })
    it("should throw error if not given getAuth function", function(){
      expect(() => new Authorizer({})).to.throw("settings require getAuth fn")
    })
    it("should throw error if given invalid getAuth function", function(){
      const invalid = [null, NaN, undefined, true, 22/7, 4, {}, /reg/, new Date(), "str", "    \n   ", ""]
      invalid.forEach(getAuth => {
        expect(() => new Authorizer({getAuth})).to.throw("settings require getAuth fn")
      })
    })
    it("should throw error if not given clearAuth function", function(){
      const settings = {getAuth: () => {}}
      expect(() => new Authorizer(settings)).to.throw("settings require clearAuth fn")
    })
    it("should throw error if given invalid getAuth function", function(){
      const settings = {getAuth: () => {}}
      const invalid = [null, NaN, undefined, true, 22/7, 4, {}, /reg/, new Date(), "str", "    \n   ", ""]
      invalid.forEach(clearAuth => {
        settings.clearAuth = clearAuth
        expect(() => new Authorizer(settings)).to.throw("settings require clearAuth fn")
      })
    })
    it("should throw error if not given config store name", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}}
      expect(() => new Authorizer(settings)).to.throw("settings require non-empty name str")
    })
    it("should throw error if passed invalid config store name", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}}
      const invalid = [null, NaN, undefined, true, 22/7, 4, () => {}, /reg/, new Date(), {}, "    \n   ", ""]
      invalid.forEach(name => {
        settings.name = name
        expect(() => new Authorizer(settings)).to.throw("settings require non-empty name str")
      })
    })
    it("should not require settings to have truthy props field", function(){
      const nonInputs = [false, null, undefined, 0, "", NaN]
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "my-app"}
      nonInputs.forEach(props => {
        settings.props = props;
        expect(() => new Authorizer(settings)).to.not.throw()
      })
    })
    it("should throw error if passed invalid props obj", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "my-app"}
      const invalid = [true, 22/7, 4, () => {}, /reg/, new Date(), "    \n   "]
      invalid.forEach(props => {
        settings.props = props;
        expect(() => new Authorizer(settings)).to.throw("props setting must be obj literal")
      })
    })
    it("should otherwise instantiate properly", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"}
      expect(() => new Authorizer(settings)).to.not.throw()
    })
    it("should properly instantiate config store", function(){
      let didMakeStore;
      const name = "my-app"
      revert = Authorizer.__set__("ConfigStore", class ConfigStore {
        constructor(name){
          didMakeStore = true;
          expect(name).to.equal("my-app")
        }
      })
      const settings = {getAuth:() => {}, clearAuth: () => {}, name}
      const auth = new Authorizer(settings);
      expect(didMakeStore).to.be.true;
    })
  })

  // mocks are not async, but use done() to ensure we hit the code path
  describe("making authenticated calls with ensure method", function(){
    describe("prompts for credentials if not already authenticated", function(){
      it("should prompt for default credentials if no props setting provided", function(done){
        const name = "my-app";
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => {
            expect(props).to.deep.equal({
              username: {message: "Enter username"},
              password: {message: "Enter password", hidden: true}
            })
            expect(cb).to.be.a("function")
            done()
          }
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = () => auth.ensure((config, onFail) => onFail())
        authHttpReq()
      })
      it("should prompt for user-specified credentials if props setting provided", function(done){
        const name = "my-app"
        const props = {
          username: {message: "Enter Github username"},
          password: {message: "Enter Github password", hidden: true}
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (inProps, cb) => {
            expect(inProps).to.equal(props)
            expect(cb).to.be.a("function")
            done()
          }
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name, props};
        const auth = new Authorizer(settings);
        const authHttpReq = () => auth.ensure((config, onFail) => onFail())
        authHttpReq()
      })
      it("should immediately return error if obtaining credentials fails", function(done){
        const name = "my-app";
        const msg = "error getting CLI input"
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(new Error(msg))
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => onFail(cb))
        authHttpReq((err, res) => {
          expect(err).to.be.an("error");
          expect(err.message).to.equal(msg);
          expect(res).to.be.undefined;
          done()
        })
      })
      it("should only re-prompt for credentials if credentials were invalid", function(done){
        let promptCalled = 0, reqCalled = 0;
        const name = "my-app"
        const badInput = {username: "atlassubbed", password: "3.1415"};
        const getAuth = (creds, config, cb) => cb(null) // no result === invalid creds
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => {
            if (++promptCalled === 1) return cb(null, badInput)
            expect(reqCalled).to.equal(1);
            done()
          }
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => {
          reqCalled++
          onFail(cb)
        })
        authHttpReq(() => {})
      })
    })
    describe("runs getAuth to obtain non-credentials (e.g. token) authorization", function(){
      it("should run getAuth with input credentials and config to obtain valid authorization config", function(done){
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const getAuth = (creds, config, cb) => {
          expect(creds).to.equal(input)
          expect(config).to.deep.equal({})
          expect(cb).to.be.a("function")
          done()
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => onFail(cb))
        authHttpReq()
      })
      it("should immediately return error if getAuth fails for non-auth related reason", function(done){
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const msg = "personal token API is down";
        const getAuth = (creds, config, cb) => cb(new Error(msg))
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => onFail(cb))
        authHttpReq((err, res) => {
          expect(err).to.be.an("error")
          expect(err.message).to.equal(msg)
          expect(res).to.be.undefined;
          done()
        })
      })
      it("should re-run getAuth with new credentials if old credentials were invalid", function(done){
        let getAuthCalled = 0, promptCalled = 0;
        const name = "my-app"
        const goodInput = {username: "atlassubbed", password: "22/7"};
        const badInput = {username: "atlassubbed", password: "3.1415926"}
        const getAuth = (creds, config, cb) => {
          if (++getAuthCalled === 2){
            expect(creds).to.equal(goodInput)
            return done()
          }
          expect(creds).to.equal(badInput)
          cb(null) // no result === invalid creds
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, ++promptCalled === 2 ? goodInput : badInput)
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => {
          onFail(cb)
        })
        authHttpReq(() => {})
      })
    })
    describe("provides arbitrary request with up-to-date authorization", function(){
      it("should make call with current authorization config", function(done){
        const name = "my-app";
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = () => auth.ensure((config, onFail) => {
          expect(config).to.deep.equal({});
          expect(onFail).to.be.a("function")
          done();
        })
        authHttpReq()
      })
      it("should immediately return error if call fails for non-auth related reason", function(done){
        let promptCalled = 0, getAuthCalled = 0;
        const name = "my-app";
        const msg = "getOwnPosts API is down"
        const getAuth = () => {
          getAuthCalled++
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: () => {
            promptCalled++
          }
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure(() => {
          cb(new Error(msg))
        })
        authHttpReq((err, res) => {
          expect(err).to.be.an("error");
          expect(err.message).to.equal(msg)
          expect(res).to.be.undefined;
          expect(getAuthCalled).to.equal(0)
          expect(promptCalled).to.equal(0)
          done()
        });
      })
      it("should immediately return response if call succeeds", function(done){
        let promptCalled = 0, getAuthCalled = 0;
        const name = "my-app";
        const res = ["private post1", "private post2", "private post3"]
        const getAuth = () => {
          getAuthCalled++
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: () => {
            promptCalled++
          }
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure(() => {
          cb(null, res) // already authed, immediately return res
        })
        authHttpReq((err, inRes) => {
          expect(err).to.be.null;
          expect(inRes).to.equal(res);
          expect(getAuthCalled).to.equal(0)
          expect(promptCalled).to.equal(0)
          done()
        });
      })
      it("should set new config upon receiving valid authorization", function(done){
        let reqCalled = 0;
        const name = "my-app";
        const input = {username: "atlassubbed", password: "22/7"}
        const goodConfig = {token: "personal auth token"}
        const getAuth = (creds, config, cb) => {
          cb(null, goodConfig) // return a config === valid creds
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            set(newConfig){
              expect(newConfig).to.equal(goodConfig)
              done()
            }
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => {
          if (++reqCalled === 1) onFail(cb);
        })
        authHttpReq(() => {});
      })
      it("should re-run the call upon receiving valid authorization config", function(done){
        let reqCalled = 0;
        const name = "my-app";
        const input = {username: "atlassubbed", password: "22/7"}
        const goodConfig = {token: "personal auth token"}
        const getAuth = (creds, config, cb) => {
          cb(null, goodConfig) // return a config === valid creds
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            set(newConfig){
              this.all = newConfig
            }
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => {
          if (++reqCalled === 1){
            expect(config).to.deep.equal({});
            return onFail(cb);
          }
          expect(config).to.deep.equal(goodConfig)
          done()
        })
        authHttpReq(() => {});
      })
      it("should ultimately return response once call succeeds", function(done){
        let promptCalled = 0, getAuthCalled = 0, configCalled = 0, reqCalled = 0;
        const name = "my-app";
        const res = ["private post1", "private post2", "private post3"];
        const goodConfig = {token: "required personal access token"}
        const badInput = {username: "atlassubbed", password: "22/7"}
        const goodInput = {username: "atlassubbed", password: "3.14"}
        const getAuth = (creds, config, cb) => {
          if (++getAuthCalled === 1){
            expect(creds).to.equal(badInput)
            expect(config).to.deep.equal({})
            return cb(null) // no result === invalid creds
          }
          expect(creds).to.equal(goodInput);
          expect(config).to.deep.equal({});
          cb(null, goodConfig)
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            set(newConfig){
              configCalled++
              this.all = newConfig
            }
          },
          getInput: (creds, cb) => {
            cb(null, ++promptCalled === 1 ? badInput : goodInput)
          }
        })
        const settings = {getAuth, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        const authHttpReq = cb => auth.ensure((config, onFail) => {
          if (++reqCalled === 1) {
            expect(config).to.deep.equal({})
            return onFail(cb)
          }
          expect(config).to.deep.equal(goodConfig);
          cb(null, res)
        })
        authHttpReq((err, inRes) => {
          expect(err).to.be.null;
          expect(inRes).to.equal(res)
          expect(getAuthCalled).to.equal(2);
          expect(promptCalled).to.equal(2);
          expect(configCalled).to.equal(1);
          expect(reqCalled).to.equal(2)
          done()
        })
      })
    })
  })

  describe("removing authorization with revoke method", function(){
    describe("prompts for credentials", function(){
      it("should prompt for default credentials if no props setting provided", function(done){
        const name = "my-app";
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => {
            expect(props).to.deep.equal({
              username: {message: "Enter username"},
              password: {message: "Enter password", hidden: true}
            })
            expect(cb).to.be.a("function")
            done()
          }
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => {})
      })
      it("should prompt for user-specified credentials if props setting provided", function(done){
        const name = "my-app";
        const props = {
          username: {message: "Enter Github username"},
          password: {message: "Enter Github password", hidden: true}
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (inProps, cb) => {
            expect(inProps).to.equal(props)
            expect(cb).to.be.a("function")
            done()
          }
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name, props};
        const auth = new Authorizer(settings);
        auth.revoke(() => {})
      })
      it("should immediately return error if obtaining credentials fails", function(done){
        const name = "my-app";
        const msg = "error getting CLI input"
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(new Error(msg))
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name};
        const auth = new Authorizer(settings);
        auth.revoke(err => {
          expect(err).to.be.an("error")
          expect(err.message).to.equal(msg);
          done()
        })
      })
      it("should re-prompt for credentials if credentials were invalid", function(done){
        let promptCalled = 0;
        const name = "my-app"
        const badInput = {username: "atlassubbed", password: "3.1415"};
        const clearAuth = (creds, config, cb) => cb(null) // no result === invalid creds
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => {
            if (++promptCalled === 1) return cb(null, badInput)
            done()
          }
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => {})
      })
    })
    describe("runs clearAuth to revoke non-credential (e.g. token) authorization", function(){
      it("should run clearAuth with input credentials and config to revoke any tokens in the config", function(done){
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const clearAuth = (creds, config, cb) => {
          expect(creds).to.equal(input)
          expect(config).to.deep.equal({})
          expect(cb).to.be.a("function")
          done()
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => {})
      })
      it("should immediately return error if clearAuth fails for non-auth related reason", function(done){
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const msg = "personal token API is down";
        const clearAuth = (creds, config, cb) => cb(new Error(msg))
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(err => {
          expect(err).to.be.an("error")
          expect(err.message).to.equal(msg)
          done()
        })
      })
      it("should re-run clearAuth with new credentials if old credentials were invalid", function(done){
        let clearAuthCalled = 0, promptCalled = 0;
        const name = "my-app"
        const goodInput = {username: "atlassubbed", password: "22/7"};
        const badInput = {username: "atlassubbed", password: "3.1415926"}
        const clearAuth = (creds, config, cb) => {
          if (++clearAuthCalled === 2){
            expect(creds).to.equal(goodInput)
            return done()
          }
          expect(creds).to.equal(badInput)
          cb(null) // no result === invalid creds
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(null, ++promptCalled === 2 ? goodInput : badInput)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => {})
      })
      it("should return no error upon successfully clearing authorization", function(done){
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const clearAuth = (creds, config, cb) => cb(null, ["token", "otherData"])
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            delete(){}
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(err => {
          expect(err).to.be.null
          done()
        })
      })
    })
    describe("removes authorization from the config", function(){
      it("should only delete specified keys in config when clearing authorization", function(done){
        let configCalled = 0;
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const res = ["token", "tokenId", "otherData"];
        const token2 = "different token for different auth scope";
        const token2Id = "id for token2";
        const config = {
          token: "my personal api token",
          tokenId: "id of the token in api server",
          otherData: "other data for this token",
          token2,
          token2Id
        }
        const clearAuth = (creds, config, cb) => cb(null, res)
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            constructor(){
              this.all = config
            }
            delete(key){
              configCalled++
              delete this.all[key]
            }
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => {
          expect(configCalled).to.equal(3);
          expect(config.token).to.be.undefined;
          expect(config.tokenId).to.be.undefined
          expect(config.otherData).to.be.undefined;
          expect(config.token2).to.equal(token2)
          expect(config.token2Id).to.equal(token2Id)
          done()
        })
      })
      it("should correctly reflect unauthorized config in next revoke call", function(done){
        let clearAuthCalled = 0;
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const res = ["token", "tokenId", "otherData"];
        const config = {
          token: "my personal api token",
          tokenId: "id of the token in api server",
          otherData: "other data for this token"
        }
        const authorizedConfig = Object.assign({},config)
        const clearAuth = (creds, inConfig, cb) => {
          if (++clearAuthCalled === 1){
            expect(inConfig).to.deep.equal(authorizedConfig)
            return cb(null, res)
          }
          expect(inConfig).to.deep.equal({});
          done()
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            constructor(){
              this.all = config
            }
            delete(key){
              delete this.all[key]
            }
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => auth.revoke(() => {}))
      })
      it("should correctly reflect unauthorized config in next ensure call", function(done){
        let clearAuthCalled = 0;
        const name = "my-app"
        const input = {username: "atlassubbed", password: "22/7"};
        const res = ["token", "tokenId", "otherData"];
        const config = {
          token: "my personal api token",
          tokenId: "id of the token in api server",
          otherData: "other data for this token"
        }
        const authorizedConfig = Object.assign({},config)
        const clearAuth = (creds, inConfig, cb) => {
          expect(inConfig).to.deep.equal(authorizedConfig)
          cb(null, res);
        }
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {
            constructor(){
              this.all = config
            }
            delete(key){
              delete this.all[key]
            }
          },
          getInput: (props, cb) => cb(null, input)
        })
        const settings = {getAuth: () => {}, clearAuth, name};
        const auth = new Authorizer(settings);
        auth.revoke(() => auth.ensure(config => {
          expect(config).to.deep.equal({});
          done();
        }))
      })
    })
  })

  describe("initializing authorization provider", function(){
    it("should throw error if called with no args", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
      const authorizer = new Authorizer(settings);
      expect(() => authorizer.createProvider()).to.throw("requires onError fn")
    })
    it("should throw error if onError callback is not function", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
      const authorizer = new Authorizer(settings);
      const invalid = [null, NaN, undefined, true, 22/7, 4, {}, /reg/, new Date(), "str", "    \n   ", ""]
      invalid.forEach(onError => {
        expect(() => authorizer.createProvider(onError)).to.throw("requires onError fn")
        expect(() => authorizer.createProvider(null, onError)).to.throw("requires onError fn")
      })
    })
    it("should otherwise return provider function if passed valid onError callback", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
      const authorizer = new Authorizer(settings);
      expect(authorizer.createProvider(() => {})).to.be.a("function");
      expect(authorizer.createProvider(null, () => {})).to.be.a("function");
    })
    it("should throw error if passed invalid truthy config store", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
      const authorizer = new Authorizer(settings);
      const invalidTruthy = [true, 22/7, 4, () => {}, "str", "    \n   "]
      invalidTruthy.forEach(store => {
        expect(() => authorizer.createProvider(store, () => {})).to.throw("config store must be obj")
      })
    })
    it("should otherwise return provider function if passed valid or falsy config store", function(){
      const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
      const authorizer = new Authorizer(settings);
      const validOrFalsy = [false, null, undefined, 0, "", NaN, {}, new Date(), /reg/]
      validOrFalsy.forEach(store => {
        expect(() => authorizer.createProvider(store, () => {})).to.not.throw()
      })
    })
  })

  describe("using authorization provider", function(){
    describe("with config store", function(){
      it("should wrap a request and return the wrapped request", function(){
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        validStores.forEach(store => {
          const provider = authorizer.createProvider(store, () => {})
          expect(provider(() => {})).to.be.a("function")
        })
      })
      it("should call the ensure method when invoking the wrapped request", function(){
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledEnsure = 0;
        validStores.forEach(store => {
          const request = () => {}
          const giveAuth = authorizer.createProvider(store, () => {})
          const withAuth = giveAuth(request);
          authorizer.ensure = auxReq => {
            expect(auxReq).to.be.a("function")
            calledEnsure++
          }
          withAuth()
        })
        expect(calledEnsure).to.equal(validStores.length)
      })
      it("should call original request with provided arguments", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledOriginal = 0;
        validStores.forEach(store => {
          const request = (a, b, c, cb) => {
            expect([a,b,c]).to.deep.equal([1,2,3])
            expect(cb).to.be.a("function")
            calledOriginal++
          }
          const giveAuth = authorizer.createProvider(store, () => {})
          giveAuth(request)(1,2,3)
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should call original request with only callback if no provided arguments", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledOriginal = 0;
        validStores.forEach(store => {
          const request = cb => {
            expect(cb).to.be.a("function")
            calledOriginal++
          }
          const giveAuth = authorizer.createProvider(store, () => {})
          giveAuth(request)()
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should make config available in the desired store", function(){
        const config = {myToken: "token123"};
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {
          constructor(){ this.all = config}
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledOriginal = 0;
        validStores.forEach(store => {
          const request = cb => {
            expect(store.config).to.deep.equal(config)
            calledOriginal++
          }
          const giveAuth = authorizer.createProvider(store, () => {})
          giveAuth(request)()
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should make the most recent config available in the desired store", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledOriginal = 0;
        validStores.forEach(store => {
          const request = cb => {
            expect(store.config.value).to.equal(store.toString())
            calledOriginal++
          }
          const giveAuth = authorizer.createProvider(store, () => {})
          authorizer.ensure = auxReq => auxReq({value: store.toString()}, () => {})
          giveAuth(request)()
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should invoke onError with error if original request encounters non-auth error", function(){
        const msg = "api is down"
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        let calledErrorHandler = 0;
        validStores.forEach(store => {
          const request = cb => cb(new Error(msg))
          const giveAuth = authorizer.createProvider(store, err => {
            expect(err).to.be.an("error");
            expect(err.message).to.equal(msg)
            calledErrorHandler++
          })
          giveAuth(request)()
        })
        expect(calledErrorHandler).to.equal(validStores.length)
      })
      it("should invoke prompt with onError if original request encounters auth-related error", function(){
        let msg = "prompt error";
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(new Error(msg))
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        const falsyResponses = [false, null, undefined, 0, "", NaN];
        let onErrorCalled = 0;
        validStores.forEach(store => {
          falsyResponses.forEach(res => {
            const request = cb => cb(null, res) // falsy responses === auth failed
            const giveAuth = authorizer.createProvider(store, err => {
              expect(err).to.be.an("error");
              expect(err.message).to.equal(msg)
              onErrorCalled++
            })
            giveAuth(request)()
          })
        })
        const numCases = validStores.length * falsyResponses.length;
        expect(onErrorCalled).to.equal(numCases)
      })
      it("should otherwise call wrapped request's callback with a truthy response", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        const truthyResponses = [true, 22/7, 4, () => {}, /reg/, new Date(), "str", "    \n   "]
        let finalCallbackCalled = 0;
        validStores.forEach(store => {
          truthyResponses.forEach(res => {
            const request = cb => cb(null, res) // truthy responses === req succeeded
            const giveAuth = authorizer.createProvider(store, err => {})
            authorizer.ensure = auxReq => auxReq({}, () => {})
            giveAuth(request)(inRes => {
              expect(inRes).to.equal(res)
              finalCallbackCalled++
            })
          })
        })
        const numCases = validStores.length * truthyResponses.length;
        expect(finalCallbackCalled).to.equal(numCases)
      })
      it("should not call wrapped request's callback if it does not exist", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [{}, new Date(), /reg/]
        const truthyResponses = [true, 22/7, 4, () => {}, /reg/, new Date(), "str", "    \n   "]
        let calledOriginal = 0;
        validStores.forEach(store => {
          truthyResponses.forEach(res => {
            const request = cb => {
              cb(null, res) // truthy responses === req succeeded
              calledOriginal++
            }
            const giveAuth = authorizer.createProvider(store, () => {})
            authorizer.ensure = auxReq => auxReq({}, () => {})
            expect(() => giveAuth(request)()).to.not.throw();
          })
        })
        const numCases = validStores.length * truthyResponses.length;
        expect(calledOriginal).to.equal(numCases)
      })
    })
    describe("without config store", function(){
      it("should wrap a request and return the wrapped request", function(){
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        validStores.forEach(store => {
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(() => {});
          else giveAuth = authorizer.createProvider(store, () => {});
          expect(giveAuth(() => {})).to.be.a("function")
        })
      })
      it("should call the ensure method when invoking the wrapped request", function(){
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        let calledEnsure = 0;
        validStores.forEach(store => {
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(() => {});
          else giveAuth = authorizer.createProvider(store, () => {});
          const request = () => {}
          const withAuth = giveAuth(request);
          authorizer.ensure = auxReq => {
            expect(auxReq).to.be.a("function")
            calledEnsure++
          }
          withAuth()
        })
        expect(calledEnsure).to.equal(validStores.length)
      })
      it("should call original request with provided arguments and additional config argument", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        let calledOriginal = 0;
        validStores.forEach(store => {
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(() => {});
          else giveAuth = authorizer.createProvider(store, () => {});
          const request = (config, a, b, c, cb) => {
            expect(config).to.deep.equal({})
            expect([a,b,c]).to.deep.equal([1,2,3])
            expect(cb).to.be.a("function")
            calledOriginal++
          }
          giveAuth(request)(1,2,3)
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should call original request with only callback and config if no provided arguments", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        let calledOriginal = 0;
        validStores.forEach(store => {
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(() => {});
          else giveAuth = authorizer.createProvider(store, () => {});
          const request = (config, cb) => {
            expect(config).to.deep.equal({})
            expect(cb).to.be.a("function")
            calledOriginal++
          }
          giveAuth(request)()
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should make the correct config available as the first argument to the request", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        let calledOriginal = 0;
        validStores.forEach(store => {
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(() => {});
          else giveAuth = authorizer.createProvider(store, () => {});
          const request = (config,cb) => {
            expect(config.value).to.equal(""+store)
            calledOriginal++
          }
          authorizer.ensure = auxReq => auxReq({value: ""+store}, () => {})
          giveAuth(request)()
        })
        expect(calledOriginal).to.equal(validStores.length)
      })
      it("should invoke onError with error if original request encounters non-auth error", function(){
        const msg = "api is down"
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        let calledErrorHandler = 0;
        validStores.forEach(store => {
          const onError = err => {
            expect(err).to.be.an("error");
            expect(err.message).to.equal(msg)
            calledErrorHandler++
          }
          let giveAuth;
          if (store === undefined) giveAuth = authorizer.createProvider(onError);
          else giveAuth = authorizer.createProvider(store, onError);
          const request = (config, cb) => cb(new Error(msg))
          giveAuth(request)()
        })
        expect(calledErrorHandler).to.equal(validStores.length)
      })
      it("should invoke prompt with onError if original request encounters auth-related error", function(){
        let msg = "prompt error";
        revert = Authorizer.__set__({
          ConfigStore: class ConfigStore {},
          getInput: (props, cb) => cb(new Error(msg))
        })
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        const falsyResponses = validStores
        let onErrorCalled = 0;
        validStores.forEach(store => {
          falsyResponses.forEach(res => {
            const onError = err => {
              expect(err).to.be.an("error");
              expect(err.message).to.equal(msg)
              onErrorCalled++
            }
            let giveAuth;
            if (store === undefined) giveAuth = authorizer.createProvider(onError);
            else giveAuth = authorizer.createProvider(store, onError);
            const request = (config, cb) => cb(null, res) // falsy responses === auth failed
            giveAuth(request)()
          })
        })
        const numCases = validStores.length * falsyResponses.length;
        expect(onErrorCalled).to.equal(numCases)
      })
      it("should otherwise call wrapped request's callback with a truthy response", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        const truthyResponses = [true, 22/7, 4, () => {}, /reg/, new Date(), "str", "    \n   "]
        let finalCallbackCalled = 0;
        validStores.forEach(store => {
          truthyResponses.forEach(res => {
            let giveAuth;
            if (store === undefined) giveAuth = authorizer.createProvider(() => {});
            else giveAuth = authorizer.createProvider(store, () => {});
            const request = (config, cb) => cb(null, res) // truthy responses === req succeeded
            authorizer.ensure = auxReq => auxReq({}, () => {})
            giveAuth(request)(inRes => {
              expect(inRes).to.equal(res)
              finalCallbackCalled++
            })
          })
        })
        const numCases = validStores.length * truthyResponses.length;
        expect(finalCallbackCalled).to.equal(numCases)
      })
      it("should not call wrapped request's callback if it does not exist", function(){
        revert = Authorizer.__set__("ConfigStore", class ConfigStore {})
        const settings = {getAuth: () => {}, clearAuth: () => {}, name: "atlassubbed"};
        const authorizer = new Authorizer(settings);
        const validStores = [undefined, false, null, 0, "", NaN]
        const truthyResponses = [true, 22/7, 4, () => {}, /reg/, new Date(), "str", "    \n   "]
        let calledOriginal = 0;
        validStores.forEach(store => {
          truthyResponses.forEach(res => {
            let giveAuth;
            if (store === undefined) giveAuth = authorizer.createProvider(() => {});
            else giveAuth = authorizer.createProvider(store, ()=> {});
            const request = (config, cb) => {
              cb(null, res) // truthy responses === req succeeded
              calledOriginal++
            }
            authorizer.ensure = auxReq => auxReq({}, () => {})
            expect(() => giveAuth(request)()).to.not.throw();
          })
        })
        const numCases = validStores.length * truthyResponses.length;
        expect(calledOriginal).to.equal(numCases)
      })
    })
  })
})
