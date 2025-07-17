/* /verify-signature  – Netlify Function (CommonJS) */
const admin      = require("firebase-admin");
const Razorpay   = require("razorpay");
const querystring = require("querystring");      // renamed to avoid collision
const crypto     = require("crypto");

/* ── NEW: filter the noisy DEP0040 warning ─────────────────────────── */
process.on("warning", (w) => {
  if (w.code === "DEP0040" && w.message.includes("punycode")) return;
  console.warn(w);
});
/* ──────────────────────────────────────────────────────────────────── */

/* ─────────────── initialise SDKs ─────────────── */
const serviceAccount = {
  projectId   : process.env.FIREBASE_PROJECT_ID,
  clientEmail : process.env.FIREBASE_CLIENT_EMAIL,
  // Netlify stores the literal "\n" in env vars → turn them into real new‑lines
  privateKey  : process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!admin.apps.length) {         // ✅ only once, even after re‑bundles
  admin.initializeApp({
    credential : admin.credential.cert(serviceAccount),
    projectId  : process.env.FIREBASE_PROJECT_ID,
  });
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const rzp = new Razorpay({
  key_id     : process.env.RZP_KEY,
  key_secret : process.env.RZP_SECRET,
});

/* helper: HMAC‑SHA256 signature check (kept for reference) */
function verifySignature({ order_id, payment_id, signature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RZP_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest("hex");
  return expected === signature;
}

/* ─────────────────── main handler ─────────────────── */
exports.handler = async (event) => {
 /* PayPal wallet hits us first with a GET (no body yet) and then
    with a POST.  Accept both verbs. */
const isPost = event.httpMethod === "POST";
const isGet  = event.httpMethod === "GET";
if (!isPost && !isGet) {
  return { statusCode: 405, body: "Method not allowed" };
}

  try {
  /* 1️⃣ decode & normalise body (JSON ⇆ url‑encoded) */
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  const cType = (event.headers["content-type"] || "").toLowerCase();
  const body  = cType.includes("application/json") || rawBody.trim().startsWith("{")
    ? JSON.parse(rawBody || "{}")          // POSTed as JSON
    : querystring.parse(rawBody);          // POSTed as x‑www‑form‑urlencoded

  /* 2️⃣ Merge: query‑string + POST body (if any) → one params object */
  const params = {
    ...(event.queryStringParameters || {}),
    ...(isPost ? body : {})
  };

  /* 3️⃣ extract Razorpay params (a few aliases just in case) */
  const payId = params.razorpay_payment_id || params.payment_id || params.payId;
  const ordId = params.razorpay_order_id   || params.order_id   || params.ordId;
  const sign  = params.razorpay_signature  || params.signature  || params.sign;

  /* 4️⃣ PayPal wallet often calls us once *before* capture.
         If payment_id or signature are still missing, respond 202 so
         Razorpay will POST again (with all three fields) in a moment. */
  if (!payId || !sign) {
    return { statusCode: 202, body: "Payment pending – trying again…" };
  }

  /* 5️⃣ optional JSON blobs coming from your success page */
  const cart   = typeof params.cart   === "string" ? JSON.parse(params.cart)   : (params.cart   || []);
  const addr   = typeof params.addr   === "string" ? JSON.parse(params.addr)   : (params.addr   || {});
  const totals = typeof params.totals === "string" ? JSON.parse(params.totals) : (params.totals || {});
  const uid    = params.uid || "";

    /* 3️⃣ verify the signature with Razorpay helper */
    const { validatePaymentVerification } = require("razorpay/dist/utils/razorpay-utils");
    const isValid = validatePaymentVerification(
      { order_id: ordId, payment_id: payId },
      sign,
      process.env.RZP_SECRET
    );
    if (!isValid) {
      return { statusCode: 400, body: "Invalid payment signature" };
    }

    /* 4️⃣ decrement stock atomically */
    await decrementStock(cart);

    /* 5️⃣ write order document */
    const { name = "", address = "", pincode = "", mobileNumber = "" } = addr;

    const ref  = db.collection("orders").doc(ordId);   // use RZP order‑id
    const data = {
      uid,
      name,
      address,
      pincode,
      mobileNumber,               // keep the same camel‑case everywhere
      cart,
      totalUSD   : totals.usd,
      total      : totals.sel,
      currency   : totals.curr,
      paymentId  : payId,
      paymentMode: "Razorpay",
      timestamp  : admin.firestore.FieldValue.serverTimestamp(),
      orderNumber: `ORD-${Date.now()}`,
    };

    if ((await ref.get()).exists) {
      await ref.update(data);      // ← second hit enriches the doc
    } else {
      await ref.set(data);         // ← first hit creates the doc
    }

    /* STEP 6 – build query‑string for the success page */
    const redirectQS =
        `?razorpay_payment_id=${payId}` +
        `&razorpay_order_id=${ordId}`   +
        `&razorpay_signature=${sign}`;

    return {
      statusCode : 302,
      headers    : { Location: `/razorpay-success.html${redirectQS}` },
      body       : "",
    };
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
