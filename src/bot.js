// const { waitForVerificationCode, forwardSteamLoginEmail } = require("./email");

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
require("dotenv").config();
const { google } = require("googleapis");

const app = express();
const PORT = 4200;
const TOKENS_FILE = path.join(__dirname, "tokens.json");
const GMAIL_TOKENS_FILE = path.join(__dirname, "gmail_tokens.json");

app.use(express.json());

// ======================= SALLA TOKENS START =======================

const storeTokens = async (storedTokens) => {
  try {
    await fs.writeFile(
      TOKENS_FILE,
      JSON.stringify(storedTokens, null, 2),
      "utf8"
    );
    console.log("Salla tokens stored in tokens.json");
  } catch (error) {
    console.error("Error storing Salla tokens:", error.message);
  }
};

const loadTokens = async () => {
  try {
    const data = await fs.readFile(TOKENS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.error("Error loading Salla tokens:", error.message);
    return null;
  }
};

let storedTokens = null;
const initializeTokens = async () => {
  storedTokens = await loadTokens();
  if (!storedTokens)
    storedTokens = {
      access_token: null,
      refresh_token: null,
      expires_at: null,
    };
};

// ======================= SALLA TOKENS END =======================

// ======================= GMAIL TOKENS START =======================

const storeGmailTokens = async (gmailTokens) => {
  try {
    await fs.writeFile(
      GMAIL_TOKENS_FILE,
      JSON.stringify(gmailTokens, null, 2),
      "utf8"
    );
    console.log("Gmail tokens stored in gmail_tokens.json");
  } catch (error) {
    console.error("Error storing Gmail tokens:", error.message);
  }
};

const loadGmailTokens = async () => {
  try {
    const data = await fs.readFile(GMAIL_TOKENS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.error("Error loading Gmail tokens:", error.message);
    return null;
  }
};

let gmailTokens = null;
const initializeGmailTokens = async () => {
  gmailTokens = await loadGmailTokens();
};

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "http://localhost:4200/oauth2callback"
);

const getGmailClient = async () => {
  if (!gmailTokens) await initializeGmailTokens();
  if (!gmailTokens) throw new Error("Gmail tokens not initialized");
  oauth2Client.setCredentials(gmailTokens);
  return google.gmail({ version: "v1", auth: oauth2Client });
};

// Function to wait for and fetch the verification code
const fetchVerificationCode = async (username, chatId, bot) => {
  const gmail = await getGmailClient();
  let lastCheckedTime = Date.now() / 1000; // Convert to seconds for Gmail API

  // Poll Gmail every 5 seconds for up to 5 minutes
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  const pollInterval = 5 * 1000; // 5 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: "Steam", // Broad search, refine if needed
        maxResults: 1,
      });

      if (res.data.messages && res.data.messages.length > 0) {
        const messageId = res.data.messages[0].id;
        const message = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        // Get message timestamp
        const messageTime = parseInt(message.data.internalDate) / 1000; // Convert to seconds
        if (messageTime <= lastCheckedTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue; // Skip if older than last check
        }

        let emailBody;
        if (message.data.payload.parts) {
          emailBody = Buffer.from(
            message.data.payload.parts[0].body.data,
            "base64"
          ).toString("utf8");
        } else {
          emailBody = Buffer.from(
            message.data.payload.body.data,
            "base64"
          ).toString("utf8");
        }

        // Check if email starts with the username
        if (emailBody.startsWith(`${username},`)) {
          const codeMatch = emailBody.match(/^[A-Z0-9]{5}$/m);
          if (codeMatch) {
            return codeMatch[0]; // Return the code (e.g., 9KPWQ)
          }
          return "لم أتمكن من استخراج رمز التحقق.";
        }
      }

      // Update last checked time if no new email
      lastCheckedTime = Date.now() / 1000;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error("Error polling Gmail:", error.message);
      return "خطأ أثناء جلب رمز التحقق.";
    }
  }
  return "انتهى وقت الانتظار. لم يتم تلقي بريد جديد.";
};

// ======================= GMAIL TOKENS END ==========================

// ======================= WEBHOOK LOGIC START =======================

app.post("/webhook", async (req, res) => {
  const { event, data } = req.body;
  if (event === "app.store.authorize") {
    storedTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };
    await storeTokens(storedTokens);
    return res.status(200).json({ message: "Tokens received and stored" });
  }
  res.status(200).json({ message: "Webhook received" });
});

app.get("/checkorder/:orderNumber", async (req, res) => {
  const orderNumber = req.params.orderNumber;
  const tokens = await loadTokens();
  if (!tokens || !tokens.access_token) {
    return res.status(500).json({ error: "No valid Salla token" });
  }
  try {
    const response = await axios.get(
      `https://api.salla.dev/admin/v2/orders/${orderNumber}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const status = response.data?.data?.status || "unknown";
    res.json({ orderNumber, status });
  } catch (error) {
    res.status(500).json({
      error: "Failed to check order",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    gmailTokens = tokens;
    await storeGmailTokens(tokens);
    res.send("Gmail authentication successful.");
  } catch (error) {
    res.status(500).send("Gmail authentication failed.");
  }
});

const startServer = async () => {
  await initializeTokens();
  await initializeGmailTokens();
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
  );
};

startServer().catch((error) =>
  console.error("Failed to start server:", error.message)
);

// ======================= WEBHOOK LOGIN END =======================

// ======================= TELEGRAM BOT START =======================

const telToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(telToken, { polling: true });

const introMessage =
  "👋 مرحبًا! أرسل لي الكود الخاص بالطلب باستخدام الأمر /code.";

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, introMessage);
});

bot.onText(/\/code/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "⏳ أنا في انتظار الكود الخاص بالطلب. أرسله الآن!");

  bot.once("message", async (nextMsg) => {
    const orderId = nextMsg.text.trim();
    bot.sendMessage(
      chatId,
      `✅ تلقيت الكود: ${orderId}. سأتحقق من حالته الآن...`
    );

    const tokens = await loadTokens();
    if (!tokens || !tokens.access_token) {
      bot.sendMessage(chatId, "❌ خطأ: لا يوجد رمز وصول صالح لـ Salla.");
      return;
    }

    try {
      const response = await axios.get(
        `https://api.salla.dev/admin/v2/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const statusName = response.data?.data?.status?.name || "غير معروف";

      if (statusName === "تم التنفيذ") {
        bot.sendMessage(
          chatId,
          `✅ الطلب (${orderId}) مكتمل. الرجاء إدخال اسم المستخدم الخاص بك (مثل mahatm121):`
        );

        bot.once("message", async (usernameMsg) => {
          const username = usernameMsg.text.trim();
          bot.sendMessage(
            chatId,
            `⏳ أنتظر بريدًا إلكترونيًا جديدًا لـ ${username}...`
          );

          const verificationCode = await fetchVerificationCode(
            username,
            chatId,
            bot
          );
          bot.sendMessage(
            chatId,
            `🔑 رمز التحقق الخاص بك: ${verificationCode}`
          );
        });
      } else {
        bot.sendMessage(
          chatId,
          `❌ الطلب (${orderId}) غير مكتمل أو غير موجود. الحالة: ${statusName}`
        );
      }
    } catch (error) {
      console.error(
        "Error fetching order:",
        error.response?.data || error.message
      );
      bot.sendMessage(chatId, `❌ خطأ أثناء التحقق من الطلب (${orderId}).`);
    }
  });
});

console.log("Telegram bot is running...");
