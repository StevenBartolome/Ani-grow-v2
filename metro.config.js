const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const emptyModule = path.resolve(__dirname, "src/lib/empty.js");

const supabasePackageMap = {
  "@supabase/supabase-js": path.resolve(__dirname, "node_modules/@supabase/supabase-js/dist/index.cjs"),
  "@supabase/postgrest-js": path.resolve(__dirname, "node_modules/@supabase/postgrest-js/dist/index.cjs"),
  "@supabase/storage-js": path.resolve(__dirname, "node_modules/@supabase/storage-js/dist/index.cjs"),
  "@supabase/realtime-js": path.resolve(__dirname, "node_modules/@supabase/realtime-js/dist/main/index.js"),
  "@supabase/auth-js": path.resolve(__dirname, "node_modules/@supabase/auth-js/dist/main/index.js"),
  "@supabase/functions-js": path.resolve(__dirname, "node_modules/@supabase/functions-js/dist/main/index.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (supabasePackageMap[moduleName]) {
    return {
      filePath: supabasePackageMap[moduleName],
      type: "sourceFile",
    };
  }
  if (
    moduleName === "iceberg-js" ||
    moduleName === "@supabase/node-fetch" ||
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

