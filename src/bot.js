// const { waitForVerificationCode, forwardSteamLoginEmail } = require("./email");

const TelegramBot = require("node-telegram-bot-api");

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
require("dotenv").config();
const axios = require("axios");

const app = express();
const PORT = 4200;
const TOKENS_FILE = path.join(__dirname, "tokens.json");

// Middleware to parse JSON bodies
app.use(express.json());

// =======================  SALLA TOKENS START  =======================

// Store tokens in a JSON file
const storeTokens = async (storedTokens) => {
  try {
    await fs.writeFile(
      TOKENS_FILE,
      JSON.stringify(storedTokens, null, 2),
      "utf8"
    );
    console.log("Tokens successfully stored in tokens.json");
  } catch (error) {
    console.error("Error storing tokens:", error.message);
  }
};

// Load tokens from the JSON file
const loadTokens = async () => {
  try {
    const data = await fs.readFile(TOKENS_FILE, "utf8");
    console.log("Tokens successfully loaded from tokens.json");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No tokens file found, starting fresh.");
      return null;
    }
    console.error("Error loading tokens:", error.message);
    return null;
  }
};

// Initialize tokens
let storedTokens = null;
const initializeTokens = async () => {
  storedTokens = await loadTokens();
  if (!storedTokens) {
    storedTokens = {
      access_token: null,
      refresh_token: null,
      expires_at: null,
    };
  }
};

// =======================  SALLA TOKENS END  =======================

// =======================  WEBHOOK LOGIC START  =======================

// Webhook endpoint to receive tokens from Salla
app.post("/webhook", async (req, res) => {
  const { event, data } = req.body;

  if (event === "app.store.authorize") {
    // Store the tokens received from Salla
    storedTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000, // Convert seconds to milliseconds
    };
    await storeTokens(storedTokens);
    console.log("Received and stored tokens from Salla:", storedTokens);
    return res.status(200).json({ message: "Tokens received and stored" });
  }

  console.log("Received webhook event:", event, data);
  res.status(200).json({ message: "Webhook received" });
});

// Optional: Test route to check stored tokens
app.get("/tokens", async (req, res) => {
  if (!storedTokens) await initializeTokens();
  res.json(storedTokens || { message: "No tokens stored yet" });
});

// Check order route
app.get("/checkorder/:orderNumber", async (req, res) => {
  const orderNumber = req.params.orderNumber;
  const tokens = await loadTokens();

  if (!tokens || !tokens.access_token) {
    return res.status(500).json({ error: "No valid access token available" });
  }

  try {
    const response = await axios.get(
      `https://api.salla.dev/admin/v2/orders/${orderNumber}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );
    console.log(response.data?.data?.status.name == "تم التنفيذ"); // status id => 1298199463
    const status = response.data?.data?.status || "unknown";
    res.json({ orderNumber, status });
  } catch (error) {
    console.error(
      "Error fetching order from Salla:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to check order",
      details: error.response?.data || error.message,
    });
  }
});

// Start the server
const startServer = async () => {
  await initializeTokens(); // Load tokens on startup
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      `Webhook endpoint available at http://localhost:${PORT}/webhook`
    );
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
});

// =======================  WEBHOOK LOGIC END  =======================

// =======================  TELEGRAM BOT START  =======================

// Replace with your actual Telegram bot token from BotFather
const telToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(telToken, { polling: true });

// Intro message
const introMessage =
  "👋 مرحبًا! أرسل لي الكود الخاص بالطلب باستخدام الأمر /code.";

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, introMessage);
});

// Handle /code command
bot.onText(/\/code/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "⏳ أنا في انتظار الكود الخاص بالطلب. أرسله الآن!");

  // Listen for the next message from the user
  bot.once("message", async (nextMsg) => {
    const orderId = nextMsg.text.trim();
    // For now, just echo back the order ID (replace with API call later)
    bot.sendMessage(
      chatId,
      `✅ تلقيت الكود: ${orderId}. سأتحقق من حالته قريبًا!`
    );

    const orderNumber = orderId;
    const tokens = await loadTokens();

    if (!tokens || !tokens.access_token) {
      return res.status(500).json({ error: "No valid access token available" });
    }

    try {
      const response = await axios.get(
        `https://api.salla.dev/admin/v2/orders/${orderNumber}`,
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );
      console.log(response.data?.data?.status.name == "تم التنفيذ"); // status id => 1298199463

      if (response.data?.data?.status.name == "تم التنفيذ") {
        bot.sendMessage(
          chatId,
          `✅ هذا الطلب (${orderId}) مسجل بالفعل وهو طلب مكتمل.`
        );
        return null;
      }

      bot.sendMessage(
        chatId,
        `❌ هذا الطلب (${orderId}) غير موجود او غير مكتمل مع الاسف.`
      );
    } catch (error) {
      console.error(
        "Error fetching order from Salla:",
        error.response?.data || error.message
      );
      bot.sendMessage(
        chatId,
        `❌ هذا الطلب (${orderId}) غير موجود او غير مكتمل مع الاسف.`
      );
    }
  });
});

// =======================  TELEGRAM BOT END  =======================

// Log when the bot starts
console.log("Telegram bot is running...");
