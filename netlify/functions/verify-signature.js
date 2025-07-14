/* ──────────────────────────────────────────────────────────
   /verify-signature  (CJS)
   ────────────────────────────────────────────────────────── */

const admin    = require("firebase-admin");
const Razorpay = require("razorpay");

/* initialise SDKs -------------------------------------------------- */
admin.initializeApp();                                   // service-account env vars
const db  = admin.firestore();
const rzp = new Razorpay({
  key_id    : process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* main handler ----------------------------------------------------- */
exports.handler = async (event) => {
  /* Netlify always invokes the file; reject non-POSTs just in case */
  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    /* 1️⃣  payload sent from /razorpay-success.html ---------------- */
    const {
      payId,             // razorpay_payment_id
      ordId,             // razorpay_order_id
      sign,              // razorpay_signature
      cart  = [],        // [{ docId, size, … }]
      addr  = {},        // { name, address, pincode, mobileNumber }
      uid,
      totals = {}        // { usd, sel, curr }
    } = JSON.parse(event.body || "{}");

    /* 2️⃣  verify the HMAC signature ------------------------------- */
    rzp.utils.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign,
    });

    /* 3️⃣  decrement live stock atomically ------------------------- */
    await decrementStock(cart);

    /* 4️⃣  build + write the order document ------------------------ */
    const {
      name = "",
      address = "",
      pincode = "",
      mobileNumber = ""
    } = addr;

    await db.collection("orders").add({
      uid,
      name,
      address,
      pincode,
      mobilenumber: mobileNumber,           // ← same snake-case as client
      cart,
      totalUSD  : totals.usd,
      total     : totals.sel,
      currency  : totals.curr,
      paymentId : payId,
      paymentMode: "Razorpay",
      timestamp : admin.firestore.FieldValue.serverTimestamp(),
      orderNumber: `ORD-${Date.now()}`
    });

    return { statusCode: 200 };
  } catch (err) {
    console.error("verify-signature failed:", err);
    return { statusCode: 400, body: err.message };
  }
};

/* helper: batch update all affected SKUs --------------------------- */
async function decrementStock(cart) {
  if (!cart.length) return;

  const batch = db.batch();
  cart.forEach(({ docId, size }) => {
    if (!docId || !size) return;                 // guard
    const ref = db.collection("products").doc(docId);
    batch.update(ref, {
      [`sizes.${size}`]: admin.firestore.FieldValue.increment(-1)
    });
  });
  await batch.commit();
}
