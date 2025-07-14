/* ──────────────────────────────────────────────────────────
   /verify-signature   (CommonJS – Netlify Functions)
   ────────────────────────────────────────────────────────── */

const admin     = require("firebase-admin");
const Razorpay  = require("razorpay");
const qs        = require("querystring");      // ← tiny helper for url-encoded

/* ─────────────── initialise SDKs ─────────────── */
admin.initializeApp();                         // creds come from env vars
const db  = admin.firestore();
const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* ─────────────────── main handler ─────────────────── */
exports.handler = async (event) => {
  /* Netlify always invokes the file; reject non-POSTs just in case */
  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    /* ── 1. Decode + normalise incoming body ─────────────────── */
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    let body;
    const cType = (event.headers["content-type"] || "").toLowerCase();

    if (cType.includes("application/json") || rawBody.trim().startsWith("{")) {
      body = JSON.parse(rawBody || "{}");
    } else {
      body = qs.parse(rawBody);                // url-encoded  a=b&c=d
    }

    /* ── 2. Pull out the fields we care about ────────────────── */
    const payId = body.razorpay_payment_id || body.payId;
    const ordId = body.razorpay_order_id   || body.ordId;
    const sign  = body.razorpay_signature  || body.sign;

    if (!payId || !ordId || !sign) {
      return { statusCode: 400, body: "Missing payment parameters" };
    }

    /* optional JSON blobs posted from the success page */
    const cart   = typeof body.cart   === "string" ? JSON.parse(body.cart)   : (body.cart   || []);
    const addr   = typeof body.addr   === "string" ? JSON.parse(body.addr)   : (body.addr   || {});
    const totals = typeof body.totals === "string" ? JSON.parse(body.totals) : (body.totals || {});
    const uid    = body.uid || "";

    /* ── 3. Verify the HMAC signature from Razorpay ──────────── */
 /* ── 3. Verify the HMAC signature from Razorpay ──────────── */
    const isValid = rzp.utility.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign,
    });

    if (!isValid) {
     return { statusCode: 400, body: "Invalid payment signature" };
   }
    /* ── 4. Decrement live stock atomically ──────────────────── */
    await decrementStock(cart);

    /* ── 5. Build + write the order document ─────────────────── */
    const {
      name = "", address = "", pincode = "", mobileNumber = ""
    } = addr;

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
