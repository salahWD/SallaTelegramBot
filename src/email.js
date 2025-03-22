const Imap = require("imap");
const { simpleParser } = require("mailparser");

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;

const imap = new Imap({
  user: GMAIL_USER,
  password: GMAIL_PASSWORD,
  host: "imap.gmail.com",
  port: 993,
  tls: true,
});

const openInbox = (cb) => {
  imap.openBox("INBOX", false, cb);
};

const waitForVerificationCode = () => {
  return new Promise((resolve, reject) => {
    imap.once("ready", () => {
      openInbox((err, box) => {
        if (err) reject(err);

        imap.on("mail", () => {
          const f = imap.seq.fetch(box.messages.total + ":*", {
            bodies: "",
            markSeen: true,
          });

          f.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) reject(err);

                if (parsed.subject.includes("Steam Guard")) {
                  const code = parsed.text.match(/\d{5}/);
                  if (code) resolve(code[0]);
                }
              });
            });
          });
        });
      });
    });

    imap.connect();
  });
};

const forwardSteamLoginEmail = () => {
  return new Promise((resolve, reject) => {
    imap.once("ready", () => {
      openInbox((err, box) => {
        if (err) reject(err);

        imap.on("mail", () => {
          const f = imap.seq.fetch(box.messages.total + ":*", {
            bodies: "",
            markSeen: true,
          });

          f.on("message", (msg) => {
            msg.on("body", (stream) => {
              simpleParser(stream, (err, parsed) => {
                if (err) reject(err);

                if (parsed.subject.includes("New Login")) {
                  resolve(parsed.text);
                }
              });
            });
          });
        });
      });
    });

    imap.connect();
  });
};

module.exports = { waitForVerificationCode, forwardSteamLoginEmail };
