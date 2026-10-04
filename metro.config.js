const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.resolver.resolverMainFields = ["react-native", "browser", "main"];

const emptyModule = path.resolve(__dirname, "src/lib/empty.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "ws" ||
    moduleName.startsWith("ws/") ||
    ["stream", "http", "https", "net", "tls", "zlib"].includes(moduleName)
  ) {
    return {
      filePath: emptyModule,
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

