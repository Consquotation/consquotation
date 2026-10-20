/* eslint-disable no-undef */

const devCerts = require("office-addin-dev-certs");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const urlDev = "https://localhost:3000/";

// Bản dev có Id/tên riêng để cài song song với bản production (manifest/manifest.dev.xml).
const DEV_ADDIN_ID = "03040238-2423-498b-b0fe-30f0425b2ed2";
const PROD_ADDIN_ID = "33062f3c-8903-4bb1-b8f1-ba7907ac7632";
const DEV_NAME = "ConsQuotation (Dev)";
const PROD_NAME = "ConsQuotation";

/**
 * URL production lấy từ biến môi trường CQ_PROD_URL (ADR-0005, ADR-0007).
 * Khi biến này chưa đặt, build production vẫn chạy nhưng KHÔNG sinh manifest production.
 */
function getProdUrl() {
  const value = process.env.CQ_PROD_URL;
  if (!value) {
    return undefined;
  }
  if (!/^https:\/\/[^/]+/.test(value)) {
    throw new Error(`CQ_PROD_URL phải là URL HTTPS, nhận được: ${value}`);
  }
  if (/localhost|127\.0\.0\.1/i.test(value)) {
    throw new Error("CQ_PROD_URL không được trỏ tới localhost.");
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function toProdManifest(content, urlProd) {
  const result = content
    .toString()
    .split(urlDev)
    .join(urlProd)
    .split(DEV_ADDIN_ID)
    .join(PROD_ADDIN_ID)
    .split(DEV_NAME)
    .join(PROD_NAME);
  if (/localhost/i.test(result)) {
    throw new Error("Manifest production vẫn chứa 'localhost'. Kiểm tra lại manifest/manifest.dev.xml.");
  }
  if (result.includes(DEV_ADDIN_ID) || result.includes(DEV_NAME)) {
    throw new Error("Manifest production vẫn chứa Id hoặc tên của bản dev.");
  }
  if (!result.includes(`<Id>${PROD_ADDIN_ID}</Id>`)) {
    throw new Error("Manifest production không có Id chính thức.");
  }
  return result;
}

async function getHttpsOptions() {
  const httpsOptions = await devCerts.getHttpsServerOptions();
  return { ca: httpsOptions.ca, key: httpsOptions.key, cert: httpsOptions.cert };
}

module.exports = async (env, options) => {
  const dev = options.mode === "development";
  const urlProd = dev ? undefined : getProdUrl();

  const manifestPatterns = [];
  if (dev) {
    manifestPatterns.push({ from: "manifest/manifest.dev.xml", to: "manifest.dev.xml" });
  } else if (urlProd) {
    manifestPatterns.push({
      from: "manifest/manifest.dev.xml",
      to: "manifest.prod.xml",
      transform: (content) => toProdManifest(content, urlProd),
    });
  } else {
    console.warn(
      "[ConsQuotation] Chưa đặt CQ_PROD_URL: build production không sinh manifest production (ADR-0005)."
    );
  }

  const config = {
    devtool: "source-map",
    entry: {
      polyfill: ["core-js/stable", "regenerator-runtime/runtime"],
      react: ["react", "react-dom"],
      taskpane: {
        import: ["./src/taskpane/index.tsx", "./src/taskpane/taskpane.html"],
        dependOn: "react",
      },
      commands: "./src/commands/commands.ts",
    },
    output: {
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".html", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
          },
        },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: ["ts-loader"],
        },
        {
          test: /\.html$/,
          exclude: /node_modules/,
          use: {
            loader: "html-loader",
            // Không để html-loader bundle <script src>: compat-gate.js phải giữ nguyên ES5 (ADR-0001).
            options: { sources: false },
          },
        },
        {
          test: /\.(png|jpg|jpeg|ttf|woff|woff2|gif|ico)$/,
          type: "asset/resource",
          generator: {
            filename: "assets/[name][ext][query]",
          },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["polyfill", "taskpane", "react"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["polyfill", "commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*.png",
            to: "assets/[name][ext][query]",
          },
          // minimized: true để Terser bỏ qua — file phải giữ nguyên ES5 như bản đã test.
          { from: "src/compat/compat-gate.js", to: "compat-gate.js", info: { minimized: true } },
          { from: "src/help/help.html", to: "help.html" },
          ...manifestPatterns,
        ],
      }),
    ],
    devServer: {
      hot: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: {
        type: "https",
        options: env.WEBPACK_BUILD || options.https !== undefined ? options.https : await getHttpsOptions(),
      },
      port: process.env.npm_package_config_dev_server_port || 3000,
    },
  };

  return config;
};
