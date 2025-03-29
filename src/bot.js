const stopCodeVerification = false;

const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const XLSX = require("xlsx"); // For reading Excel files
require("dotenv").config();
const { google } = require("googleapis");

const app = express();
const PORT = 4200;
const TOKENS_FILE = path.join(__dirname, "tokens.json");
const EXCEL_FILE = path.join(__dirname, "../emails_and_usernames.xlsx");

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

const storeGmailTokens = async (gmailTokens, email) => {
  const filePath = path.join(__dirname, `gmail_tokens_${email}.json`);
  try {
    await fs.writeFile(filePath, JSON.stringify(gmailTokens, null, 2), "utf8");
    console.log(`Gmail tokens stored for ${email}`);
  } catch (error) {
    console.error(`Error storing Gmail tokens for ${email}:`, error.message);
  }
};

const loadGmailTokens = async (email) => {
  console.log(email);
  const filePath = path.join(__dirname, `gmail_tokens_${email}.json`);
  console.log(filePath);
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.error(`Error loading Gmail tokens for ${email}:`, error.message);
    return null;
  }
};

// Load Excel file and map usernames to emails
const loadEmailUsernameMap = async () => {
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  const emailUsernameMap = new Map();
  data.forEach((row) => {
    const email = row.Email;
    const usernames = row.Username.split(",").map((u) => u.trim());
    usernames.forEach((username) => {
      if (!emailUsernameMap.has(username)) {
        // First match only
        emailUsernameMap.set(username, email);
      }
    });
  });
  return emailUsernameMap;
};

// Get Gmail client for a specific email
const getGmailClient = async (email) => {
  const tokens = await loadGmailTokens(email);
  if (!tokens) throw new Error(`No Gmail tokens for ${email}`);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI + "/oauth2callback"
  );
  oauth2Client.setCredentials(tokens);
  return google.gmail({ version: "v1", auth: oauth2Client });
};

// Fetch verification code from a specific Gmail account
const fetchVerificationCode = async (username, email, chatId, bot) => {
  const gmail = await getGmailClient(email);
  let lastCheckedTime = Date.now() / 1000;
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
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

        const messageTime = parseInt(message.data.internalDate) / 1000;
        if (messageTime <= lastCheckedTime) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
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

        if (emailBody.startsWith(`${username},`)) {
          const codeMatch = emailBody.match(/^[A-Z0-9]{3,7}$/m);
          if (codeMatch) return codeMatch[0];
          return "لم أتمكن من استخراج رمز التحقق.";
        }
      } else {
      }

      lastCheckedTime = Date.now() / 1000;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`Error polling Gmail for ${email}:`, error.message);
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

app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  const email = req.query.state; // Pass email as state (e.g., user1@gmail.com)
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI + "/oauth2callback"
    );
    const { tokens } = await oauth2Client.getToken(code);
    await storeGmailTokens(tokens, email);
    res.send(`Gmail authentication successful for ${email}.`);
  } catch (error) {
    res.status(500).send("Gmail authentication failed.");
  }
});

const startServer = async () => {
  await initializeTokens();
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

bot.onText(/\/code/, async (msg) => {
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
      console.log(`Bearer ${tokens.access_token}`);
      const response = stopCodeVerification
        ? ""
        : await axios.get(`https://api.salla.dev/admin/v2/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
      const statusName = stopCodeVerification
        ? ""
        : response.data?.data?.status?.name || "غير معروف";

      if (statusName === "تم التنفيذ" || stopCodeVerification) {
        bot.sendMessage(
          chatId,
          `✅ الطلب (${orderId}) مكتمل. الرجاء إدخال اسم المستخدم الخاص بك (مثل mahatm121):`
        );

        bot.once("message", async (usernameMsg) => {
          const username = usernameMsg.text.trim();
          const emailUsernameMap = await loadEmailUsernameMap();
          const email = emailUsernameMap.get(username);

          if (!email) {
            bot.sendMessage(
              chatId,
              `❌ لا يوجد بريد إلكتروني مرتبط بـ ${username}.`
            );
            return;
          }

          bot.sendMessage(
            chatId,
            `⏳ أنتظر بريدًا إلكترونيًا جديدًا لـ ${username} على ${email}...`
          );
          const verificationCode = await fetchVerificationCode(
            username,
            email,
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
