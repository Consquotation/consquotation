/** Thông tin bản build do webpack DefinePlugin chèn vào (webpack.config.js). */

declare const __CQ_VERSION__: string;
declare const __CQ_BUILD_MODE__: string;

export const APP_VERSION: string =
  typeof __CQ_VERSION__ === "string" ? __CQ_VERSION__ : "0.0.0-dev";

export const BUILD_MODE: "development" | "production" =
  typeof __CQ_BUILD_MODE__ === "string" && __CQ_BUILD_MODE__ === "production"
    ? "production"
    : "development";
