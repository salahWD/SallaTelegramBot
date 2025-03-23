const { google } = require("googleapis");
require("dotenv").config();

// Define OAuth2 client with your Gmail API credentials
const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID, // From Google Cloud Console
  process.env.GMAIL_CLIENT_SECRET, // From Google Cloud Console
  process.env.GMAIL_REDIRECT_URI + "/oauth2callback" // Must match redirect URI in Google Cloud
);

// Generate the authorization URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // Ensures you get a refresh_token
  scope: ["https://www.googleapis.com/auth/gmail.readonly"], // Read-only access to Gmail
});

console.log("Authorize Gmail here:", authUrl);
