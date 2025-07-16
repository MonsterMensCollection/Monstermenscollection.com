// netlify/functions/create-order.js
const Razorpay = require("razorpay");

/* ── 1.  instantiate Razorpay once ─────────────────────────────── */
const rzp = new Razorpay({
  key_id:     process.env.RZP_KEY,
  key_secret: process.env.RZP_SECRET,
});

/* ── 2.  Netlify Lambda entry‑point ─────────────────────────────── */
exports.handler = async event => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    /*  The frontend sends:
          {
            amount   : 12.34,    // always in WHOLE units (dollars, rupees…)
            currency : "USD"     // "USD"   when you intend to show PayPal
                                 // "INR"   for the usual UPI / cards flow
          }
    */
    const { amount = 0, currency = "INR" } = JSON.parse(event.body || "{}");
    const cur = currency.toUpperCase();
   /* 2️⃣  accept only the currencies you support ------------------- */
   const allowed = ["USD", "EUR", "INR"];          // add / remove here
   const cur = allowed.includes(currency.toUpperCase())
                ? currency.toUpperCase()
                : "INR";   

    
    /*  Razorpay expects the *smallest* unit:  cents, paise, euro‑cents …  */
    const amountSmallest =
      cur === "USD"
        ? Math.round(amount * 100) // $12.34 → 1234 ¢  (💵 PayPal path)
        : Math.round(amount * 100); // ₹12.34 → 1234 paise, €12.34 → 1234 ct

    /*  IMPORTANT: pass USD when you want the PayPal wallet to show up   */
    const order = await rzp.orders.create({
      amount:          amountSmallest,
      currency:        cur === "USD" ? "USD" : cur, // force‑USD only when needed
      payment_capture: 1,                           // auto‑capture
    });

    return { statusCode: 200, body: JSON.stringify({ id: order.id }) };
  } catch (err) {
    console.error("create-order failed:", err);
    return { statusCode: 500, body: err.message };
  }
};
