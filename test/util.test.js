const { describe, it } = require("mocha")
const { expect } = require("chai")
const rewire = require("rewire");

const Util = rewire("../src/util");

let revert;

describe("get prompt input", function(){

  beforeEach(function(){
    revert && revert();
  })

  it("should start prompt", function(done){
    revert = Util.__set__({
      prompt: {
        start: () => done()
      }
    })
    Util.getInput({}, () => {})
  })
  it("should remove boilerplate prompt prefix", function(done){
    const prompt = {
      start: () => {},
      message: "some prefix",
      get: () => {
        expect(prompt.message).to.equal("");
        done()
      }
    }
    revert = Util.__set__({prompt})
    Util.getInput({}, () => {})
  })
  it("should prompt user for provided inputs", function(done){
    const inputs = {
      username: {message: "arbitrary"},
      password: {message: "arbitrary", hidden: true}
    }
    revert = Util.__set__({
      prompt: {
        start: () => {},
        get: (opts, cb) => {
          expect(opts).to.deep.equal({properties: inputs})
          done()
        }
      }
    })
    Util.getInput(inputs, () => {})
  })
  it("should return error if prompt failed", function(done){
    const msg = "prompt failed"
    revert = Util.__set__({
      prompt: {
        start: () => {},
        get: (opts, cb) => cb(new Error(msg))
      }
    })
    Util.getInput({}, err => {
      expect(err).to.be.an("error");
      expect(err.message).to.equal(msg)
      done()
    })
  })
  it("should return user input if prompt succeeded", function(done){
    const response = {username: "atlassubbed", password: "22/7"}
    revert = Util.__set__({
      prompt: {
        start: () => {},
        get: (opts, cb) => cb(null, response)
      }
    })
    Util.getInput({}, (err, creds) => {
      expect(err).to.be.null;
      expect(creds).to.equal(response)
      done()
    })
  })
})
