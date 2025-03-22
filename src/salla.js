// ====================== version 1 =======================

/* // const axios = require("axios");

// const SALLA_API_KEY = process.env.SALLA_API_KEY;

// const checkOrder = async (orderCode) => {
//   try {
//     const response = await axios.get(
//       `https://api.salla.sa/v1/orders/${orderCode}`,
//       {
//         headers: {
//           Authorization: `Bearer ${SALLA_API_KEY}`,
//         },
//       }
//     );

//     if (response.data && response.data.data) {
//       return response.data.data.status;
//     } else {
//       return null;
//     }
//   } catch (error) {
//     console.error("Error fetching order from Salla:", error);
//     return null;
//   }
// };

// module.exports = { checkOrder };
 */
// ====================== version 2 =======================

/* 
const axios = require("axios");
require("dotenv").config();

const getAccessToken = async () => {
  try {
    console.log({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    });
    const response = await axios.post(
      "https://accounts.salla.sa/oauth2/token",
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: "client_credentials",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error getting access token:",
      error.response?.data || error.message
    );
    return null;
  }
};

const checkOrder = async (orderCode) => {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await axios.get(
      `https://api.salla.dev/admin/v2/orders/${orderCode}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data?.data?.status;
  } catch (error) {
    console.error(
      "Error fetching order from Salla:",
      error.response?.data || error.message
    );
    return null;
  }
};

module.exports = { checkOrder };

*/
