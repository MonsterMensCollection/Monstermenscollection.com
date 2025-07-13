/*  /netlify/functions/razorpay-webhook.js  */

const crypto  = require("crypto");
const admin   = require("firebase-admin");

/* initialise Firestore once */
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** verify the Razorpay HMAC */
function isValidSignature(rawBody, headerSign) {
  const hmac = crypto
    .createHmac("sha256", process.env.RZP_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return hmac === headerSign;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405 };

  const rawBody = event.body;                         // 🟡 keep raw!
  const headerSign = event.headers["x-razorpay-signature"];

  if (!isValidSignature(rawBody, headerSign))
    return { statusCode: 400, body: "Bad signature" };

  const payload = JSON.parse(rawBody);

  /* we only care about successful captures */
  if (payload.event !== "payment.captured") return { statusCode: 200 };

  const ordId = payload.payload.payment.entity.order_id;
  const payId = payload.payload.payment.entity.id;

  /* mark the provisional order as PAID – idempotent merge */
  await db.collection("orders").doc(ordId).set({
    status    : "PAID",
    payment_id: payId,
    paidAt    : admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return { statusCode: 200 };
};
