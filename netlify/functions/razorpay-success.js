/*
 * Verify signature server-side, then write order
 * – body contains razorpay_payment_id, razorpay_order_id, razorpay_signature
 */
const admin = require("firebase-admin");
admin.initializeApp();

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") return { statusCode: 405 };

  const body = JSON.parse(event.body);
  // 1️⃣ verify signature with your key-secret
  // 2️⃣ fetch the order details you stashed earlier (e.g. Redis, Firestore tmp)
  // 3️⃣ admin.firestore().collection("orders").add({...})
  return {
    statusCode: 302,
    headers: { Location: "/success.html" }   // a static “Thank you” page
  };
};
