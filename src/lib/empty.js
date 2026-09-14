function Mock() {}
Mock.prototype = {};
Mock.Readable = Mock;
Mock.Writable = Mock;
Mock.Transform = Mock;
Mock.PassThrough = Mock;
Mock.Stream = Mock;
Mock.Agent = Mock;
Mock.default = Mock;

module.exports = new Proxy(Mock, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    if (prop === 'prototype') {
      return target.prototype;
    }
    if (prop === '__esModule') {
      return false;
    }
    return Mock;
  },
  apply() {
    return new Mock();
  },
  construct() {
    return new Mock();
  },
});

