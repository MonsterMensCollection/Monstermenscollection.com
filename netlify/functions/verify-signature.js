const admin        = require("firebase-admin");
const Razorpay     = require("razorpay");
const querystring  = require("querystring");
const crypto       = require("crypto");

/* ── Firebase init (once) ─────────────────────────── */
if (!admin.apps.length) {
  admin.initializeApp({
    credential : admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}
const db  = admin.firestore();
const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* ─────────────────── handler ─────────────────── */
exports.handler = async (event) => {
  const isPost = event.httpMethod === "POST";
  const isGet  = event.httpMethod === "GET";
  if (!isPost && !isGet) {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    /* 1️⃣ parse body or query‑string ---------------------------- */
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const body = (event.headers["content-type"] || "").includes("application/json")
      ? JSON.parse(raw || "{}")
      : querystring.parse(raw);

    const params = { ...(event.queryStringParameters || {}), ...(isPost ? body : {}) };

    /* 2️⃣ extract RZP params ------------------------------------ */
    const payId = params.razorpay_payment_id;
    const ordId = params.razorpay_order_id;
    const sign  = params.razorpay_signature;
    if (!payId || !sign) return { statusCode: 202, body: "Pending…" };

    /* 3️⃣ validate signature ------------------------------------ */
    const { validatePaymentVerification } = require("razorpay/dist/utils/razorpay-utils");
    if (!validatePaymentVerification({ order_id: ordId, payment_id: payId }, sign, process.env.RZP_SECRET)) {
      return { statusCode: 400, body: "Invalid signature" };
    }

    /* 4️⃣ atomically update stock & store order  ---------------- */
    // … your decrementStock() and Firestore write exactly as before …

    /* 5️⃣ redirect back to success page ------------------------- */
    return {
      statusCode: 302,
      headers: {
        Location: `/razorpay-success.html?razorpay_payment_id=${payId}&razorpay_order_id=${ordId}&razorpay_signature=${sign}`,
      },
      body: "",
    };
  } catch (err) {
    console.error("verify‑signature failed:", err);
    return { statusCode: 400, body: err.message || "Bad request" };
  }
};
