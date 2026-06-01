
"use strict";


// Renvy Bail v9 Sensitive Log Cleaner + Session Repair
// Menyembunyikan log sensitif dari libsignal/session agar tidak tampil di console.
if (!global.__RENVY_BAIL_SENSITIVE_LOG_CLEANER__) {
  global.__RENVY_BAIL_SENSITIVE_LOG_CLEANER__ = true;

  const sensitivePatterns = [
    /Closing session/i,
    /SessionEntry/i,
    /privKey/i,
    /pubKey/i,
    /chainKey/i,
    /ephemeralKeyPair/i,
    /lastRemoteEphemeralKey/i,
    /registrationId/i,
    /currentRatchet/i,
    /messageKeys/i,
    /identityKey/i,
    /signedIdentityKey/i,
    /noiseKey/i,
    /advSecretKey/i,
    /creds\.json/i,
    /<Buffer\s+[0-9a-f\s]+>/i
  ];

  const toSafeText = (value) => {
    try {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message || String(value);
      return require('util').inspect(value, { depth: 2, breakLength: 120 });
    } catch (_) {
      return String(value);
    }
  };

  const hasSensitiveLog = (args) => {
    try {
      const text = args.map(toSafeText).join(' ');
      return sensitivePatterns.some((re) => re.test(text));
    } catch (_) {
      return false;
    }
  };

  const wrapConsole = (method) => {
    const original = console[method];
    if (typeof original !== 'function') return;

    console[method] = function renvySafeConsole(...args) {
      if (hasSensitiveLog(args)) {
        return;
      }
      return original.apply(console, args);
    };
  };

  wrapConsole('log');
  wrapConsole('warn');
  wrapConsole('error');
  wrapConsole('info');
  wrapConsole('debug');
}


const chalk = require("chalk");
const { version } = require("../package.json");

// Renvy Bail v7 Anti Crash Handler
// Menangkap error global yang biasanya membuat bot mati.
if (!global.__RENVY_BAIL_ANTI_CRASH_HANDLER__) {
  global.__RENVY_BAIL_ANTI_CRASH_HANDLER__ = true;
  const safeErrorText = (err) => {
    try {
      return (err && (err.stack || err.message)) || String(err);
    } catch (_) {
      return 'Unknown error';
    }
  };
  const isKnownRenvySocketError = (err) => {
    const text = safeErrorText(err).toLowerCase();
    return text.includes('connection closed')
      || text.includes('connection close')
      || text.includes('timed out')
      || text.includes('timeout')
      || text.includes('rate-overlimit')
      || text.includes('rate overlimit')
      || text.includes('overlimit')
      || text.includes('bad session')
      || text.includes('no sessions')
      || text.includes('sessionerror')
      || text.includes('message not supported')
      || text.includes('stream:error')
      || text.includes('stream error')
      || text.includes('socket closed');
  };
  process.on('unhandledRejection', (reason) => {
    const text = safeErrorText(reason);
    if (isKnownRenvySocketError(reason)) {
      console.log('[RENVY BAIL ANTI-CRASH] Handled promise error:', text.split('\n')[0]);
      return;
    }
    console.log('[RENVY BAIL WARNING] Unhandled rejection:', text);
  });
  process.on('uncaughtException', (err) => {
    const text = safeErrorText(err);
    if (isKnownRenvySocketError(err)) {
      console.log('[RENVY BAIL ANTI-CRASH] Handled exception:', text.split('\n')[0]);
      return;
    }
    console.log('[RENVY BAIL WARNING] Uncaught exception:', text);
  });
}

let gradient = null;
try {
  gradient = require("gradient-string");
} catch (_) {}

const paint = (theme, text) => {
  try {
    if (gradient && typeof gradient[theme] === "function") return gradient[theme](text);
  } catch (_) {}
  return text;
};

const pad = (text, width = 44) => {
  text = String(text || "");
  const clean = text.length > width ? text.slice(0, width) : text;
  return clean + " ".repeat(Math.max(0, width - clean.length));
};

const banner = [
  "╭──────────────────────────────────────────────╮",
  "│              R E N V Y   B A I L             │",
  "│        WhatsApp Interactive Engine            │",
  "╰──────────────────────────────────────────────╯"
];

const meta = [
  ["Name", "Renvy Bail"],
  ["Owner", "PanPan"],
  ["Version", version],
  ["Mode", "AIRich + Native Button Ready"]
];

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const steps = [
  "Booting Renvy core...",
  "Loading native flow buttons...",
  "Preparing AIRich bridge...",
  "Syncing WhatsApp socket...",
  "Finalizing runtime..."
];

let frameIndex = 0;
let stepIndex = 0;

const renderBoot = (done = false) => {
  console.clear();
  console.log("\n" + paint("cristal", banner.join("\n")) + "\n");

  for (const [key, value] of meta) {
    console.log(
      chalk.cyanBright("  ✦ ") +
      chalk.whiteBright(pad(key, 9)) +
      chalk.gray(" : ") +
      chalk.yellowBright(value)
    );
  }

  console.log("\n" + chalk.gray("  ────────────────────────────────────────────"));

  if (done) {
    console.log(chalk.greenBright.bold("  ✔ Renvy Bail Ready"));
    console.log(chalk.gray("  ────────────────────────────────────────────"));
    console.log(chalk.whiteBright("  Status  : ") + chalk.greenBright("Online & optimized"));
    console.log(chalk.whiteBright("  System  : ") + chalk.cyanBright("Baileys patched by Renvy"));
    console.log(chalk.gray("  ────────────────────────────────────────────\n"));
    return;
  }

  const frame = frames[frameIndex++ % frames.length];
  const text = steps[stepIndex] || steps[steps.length - 1];
  console.log(chalk.magentaBright(`  ${frame} ${text}`));
  console.log(chalk.gray("  ────────────────────────────────────────────\n"));
};

renderBoot(false);

const bootInterval = setInterval(() => {
  if (frameIndex % 6 === 0 && stepIndex < steps.length - 1) stepIndex++;
  renderBoot(false);
}, 120);

setTimeout(() => {
  clearInterval(bootInterval);
  renderBoot(true);
}, 3600);

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeWASocket = void 0;
const Socket_1 = __importDefault(require("./Socket"));
exports.makeWASocket = Socket_1.default;
__exportStar(require("../WAProto"), exports);
__exportStar(require("./Utils"), exports);
__exportStar(require("./Types"), exports);
__exportStar(require("./Store"), exports);
__exportStar(require("./Defaults"), exports);
__exportStar(require("./WABinary"), exports);
__exportStar(require("./WAM"), exports);
__exportStar(require("./WAUSync"), exports);
__exportStar(require("./airich"), exports);

exports.default = Socket_1.default;





