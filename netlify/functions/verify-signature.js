// netlify/functions/verify-signature.js
const admin   = require("firebase-admin");
const Razorpay= require("razorpay");

admin.initializeApp();                   // service-account creds in env vars
const db = admin.firestore();

exports.handler = async (event) => {
  try {
    const { payId, ordId, sign, cart, addr, uid, totals } = JSON.parse(event.body);

    razorpay.utils.verifyPaymentSignature({
      razorpay_payment_id: payId,
      razorpay_order_id  : ordId,
      razorpay_signature : sign,
    });

    /*  ✅ create the order document right here  */
    await finalizeOrderStockServerSide(cart);     // decrement sizes
    await db.collection("orders").add({
      uid,
      cart,
      ...addr,                                    // name, address, pin, phone
      totalUSD : totals.usd,
      total    : totals.sel,
      currency : totals.curr,
      paymentId: payId,
      paymentMode:"Razorpay",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      orderNumber:`ORD-${Date.now()}`
    });

    return { statusCode: 200 };
  } catch (err) {
    return { statusCode: 400 };
  }
};
