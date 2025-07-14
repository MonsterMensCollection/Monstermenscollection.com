/* /verify-signature  – Netlify Function (CommonJS)  */
const admin    = require("firebase-admin");
const Razorpay = require("razorpay");
const qs       = require("querystring");
const crypto   = require("crypto");

/* ── NEW: filter the noisy DEP0040 warning ─────────────────────────── */
process.on("warning", (w) => {
  if (w.code === "DEP0040" && w.message.includes("punycode")) return;
  console.warn(w);
});
/* ──────────────────────────────────────────────────────────────────── */

/* ─────────────── initialise SDKs ─────────────── */
const serviceAccount = {
  projectId  : process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Netlify stores the literal "\n" in env vars → turn them into real new-lines
  privateKey  : process.env.SERVICE_ACCOUNT_KEY   // your new env var name
                   ?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {            // ✅ only once, even after re-bundles
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId  : serviceAccount.projectId,  
  });
}
const db  = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* helper: HMAC-SHA256 signature check (kept for reference) */
function verifySignature({ order_id, payment_id, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RZP_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest("hex");
  return expected === signature;
}

/* ─────────────────── main handler ─────────────────── */
exports.handler = async (event) => {
  /* reject non-POST just in case Netlify ever routes it */
  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    /* 1️⃣ decode & normalise body (JSON ⇆ url-encoded) */
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const cType = (event.headers["content-type"] || "").toLowerCase();
    const body  = cType.includes("application/json") || rawBody.trim().startsWith("{")
      ? JSON.parse(rawBody || "{}")
      : qs.parse(rawBody);

    /* 2️⃣ extract Razorpay params */
    const payId = body.razorpay_payment_id || body.payId;
    const ordId = body.razorpay_order_id   || body.ordId;
    const sign  = body.razorpay_signature  || body.sign;
    if (!payId || !ordId || !sign) {
      return { statusCode: 400, body: "Missing payment parameters" };
    }

    /* optional JSON blobs from success page */
    const cart   = typeof body.cart   === "string" ? JSON.parse(body.cart)   : (body.cart   || []);
    const addr   = typeof body.addr   === "string" ? JSON.parse(body.addr)   : (body.addr   || {});
    const totals = typeof body.totals === "string" ? JSON.parse(body.totals) : (body.totals || {});
    const uid    = body.uid || "";

    /* 3️⃣ verify the signature with Razorpay helper */
    const { validatePaymentVerification } = require("razorpay/dist/utils/razorpay-utils");
    const isValid = validatePaymentVerification(
      { order_id: ordId, payment_id: payId },
      sign,
      process.env.RZP_SECRET
    );
    if (!isValid) {
      return { statusCode: 400, body: "Invalid payment signature" };
    }

    /* 4️⃣ decrement stock atomically */
    await decrementStock(cart);

    /* 5️⃣ write order document */
    const { name = "", address = "", pincode = "", mobileNumber = "" } = addr;

    await db.collection("orders").add({
      uid,
      name,
      address,
      pincode,
      mobilenumber : mobileNumber,
      cart,
      totalUSD     : totals.usd,
      total        : totals.sel,
      currency     : totals.curr,
      paymentId    : payId,
      paymentMode  : "Razorpay",
      timestamp    : admin.firestore.FieldValue.serverTimestamp(),
      orderNumber  : `ORD-${Date.now()}`,
    });

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("verify-signature failed:", err);
    return { statusCode: 400, body: err.message || "Bad request" };
  }
};

/* ───────────── helper: batch update all affected SKUs ───────────── */
async function decrementStock(cart = []) {
  if (!cart.length) return;
  const batch = db.batch();
  cart.forEach(({ docId, size }) => {
    if (!docId || !size) return;
    const ref = db.collection("products").doc(docId);
    batch.update(ref, {
      [`sizes.${size}`]: admin.firestore.FieldValue.increment(-1),
    });
  });
  await batch.commit();
}
