"use strict";
// create-payment-intent
//
// Called by the Next.js Route Handler (or any trusted server). Creates a
// booking if one isn't supplied, inserts a payments row, and asks the
// provider for an intent/order. Returns enough information for the browser
// to complete the flow:
//
//   M-Pesa : { providerRef, paymentId, bookingId }   (STK push fires on the
//                                                     guest's phone)
//   Stripe : { providerRef, url, paymentId, bookingId }
//            (browser redirects to Stripe's hosted Checkout at `url`)
//   PayPal : { providerRef, approveUrl, paymentId, bookingId }
//
// Required env vars (set with `supabase secrets set ...`):
//   SUPABASE_URL                       (auto-injected on Supabase)
//   SUPABASE_SERVICE_ROLE_KEY          (auto-injected on Supabase)
//   MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
//   MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL
//   STRIPE_SECRET_KEY
//   PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET
//   SITE_URL                            (used for PayPal return/cancel URLs)
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var supabase_js_1 = require("@supabase/supabase-js");
// --- Supabase admin client (service role) ------------------------------------
var supabase = supabase_js_1.createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
// --- Helpers -----------------------------------------------------------------
// This function is invoked directly from the browser (see
// lib/supabase/functions.ts) rather than through a server-side proxy,
// because the frontend is a static export with no Next.js server to host
// one. That means the browser sends a real cross-origin request — for a
// POST with a JSON body and an Authorization header, that means a CORS
// preflight (OPTIONS) first. Without these headers the preflight 404s (no
// route matches OPTIONS) and the browser blocks the actual POST with a
// CORS error before it ever reaches this code.
var CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(body, status) {
    if (status === void 0) { status = 200; }
    return new Response(JSON.stringify(body), {
        status: status,
        headers: __assign({ "Content-Type": "application/json" }, CORS_HEADERS)
    });
}
// PayPal needs a real URL to send the guest back to after they approve
// (or cancel) the order in the PayPal-hosted checkout page.
function siteUrl() {
    var _a;
    return ((_a = Deno.env.get("SITE_URL")) !== null && _a !== void 0 ? _a : "http://localhost:3000").replace(/\/$/, "");
}
// btoa() only accepts Latin1 bytes; encoding through TextEncoder first
// keeps this correct for any UTF-8 input without relying on the legacy
// (and non-portable) escape()/unescape() pair.
function base64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = "";
    for (var _i = 0, bytes_1 = bytes; _i < bytes_1.length; _i++) {
        var byte = bytes_1[_i];
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
// M-Pesa STK push requires an OAuth access token. Tokens are valid for
// ~1 hour, so we fetch a fresh one per call (functions are short-lived).
function mpesaAccessToken() {
    var _a;
    return __awaiter(this, void 0, Promise, function () {
        var env, base, key, secret, res, _b, _c, data;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    env = (_a = Deno.env.get("MPESA_ENV")) !== null && _a !== void 0 ? _a : "sandbox";
                    base = env === "production"
                        ? "https://api.safaricom.co.ke"
                        : "https://sandbox.safaricom.co.ke";
                    key = Deno.env.get("MPESA_CONSUMER_KEY");
                    secret = Deno.env.get("MPESA_CONSUMER_SECRET");
                    return [4 /*yield*/, fetch(base + "/oauth/v1/generate?grant_type=client_credentials", {
                            headers: { Authorization: "Basic " + base64(key + ":" + secret) }
                        })];
                case 1:
                    res = _d.sent();
                    if (!!res.ok) return [3 /*break*/, 3];
                    _b = Error.bind;
                    _c = "M-Pesa OAuth failed: " + res.status + " ";
                    return [4 /*yield*/, res.text()];
                case 2: throw new (_b.apply(Error, [void 0, _c + (_d.sent())]))();
                case 3: return [4 /*yield*/, res.json()];
                case 4:
                    data = _d.sent();
                    return [2 /*return*/, data.access_token];
            }
        });
    });
}
// --- Provider calls ----------------------------------------------------------
function createMpesaIntent(opts) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var env, base, token, shortcode, passkey, callbackUrl, timestamp, password, phone, res, data;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    env = (_a = Deno.env.get("MPESA_ENV")) !== null && _a !== void 0 ? _a : "sandbox";
                    base = env === "production"
                        ? "https://api.safaricom.co.ke"
                        : "https://sandbox.safaricom.co.ke";
                    return [4 /*yield*/, mpesaAccessToken()];
                case 1:
                    token = _c.sent();
                    shortcode = Deno.env.get("MPESA_SHORTCODE");
                    passkey = Deno.env.get("MPESA_PASSKEY");
                    callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");
                    timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000)
                        .toISOString()
                        .replace(/[^0-9]/g, "")
                        .slice(0, 14);
                    password = base64("" + shortcode + passkey + timestamp);
                    phone = opts.phone.replace(/^\+/, "").replace(/^0/, "254");
                    return [4 /*yield*/, fetch(base + "/mpesa/stkpush/v1/processrequest", {
                            method: "POST",
                            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                BusinessShortCode: shortcode,
                                Password: password,
                                Timestamp: timestamp,
                                TransactionType: "CustomerPayBillOnline",
                                Amount: Math.round(opts.amount),
                                PartyA: phone,
                                PartyB: shortcode,
                                PhoneNumber: phone,
                                CallBackURL: callbackUrl,
                                AccountReference: opts.bookingId,
                                TransactionDesc: "Booking " + opts.bookingId
                            })
                        })];
                case 2:
                    res = _c.sent();
                    return [4 /*yield*/, res.json()];
                case 3:
                    data = _c.sent();
                    if (data.ResponseCode !== "0") {
                        throw new Error("M-Pesa STK push rejected: " + ((_b = data.ResponseDescription) !== null && _b !== void 0 ? _b : JSON.stringify(data)));
                    }
                    return [2 /*return*/, { providerRef: data.CheckoutRequestID }];
            }
        });
    });
}
function createStripeIntent(opts) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var key, params, res, data;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    key = Deno.env.get("STRIPE_SECRET_KEY");
                    params = new URLSearchParams();
                    params.set("mode", "payment");
                    params.set("success_url", siteUrl() + "/booking?stripe=success&bookingId=" + opts.bookingId);
                    params.set("cancel_url", siteUrl() + "/booking?stripe=cancel&bookingId=" + opts.bookingId);
                    params.set("line_items[0][quantity]", "1");
                    params.set("line_items[0][price_data][currency]", opts.currency.toLowerCase());
                    params.set("line_items[0][price_data][unit_amount]", String(Math.round(opts.amount * 100)));
                    params.set("line_items[0][price_data][product_data][name]", "Booking deposit " + opts.bookingId);
                    params.set("payment_intent_data[metadata][booking_id]", opts.bookingId);
                    params.set("payment_intent_data[metadata][payment_id]", opts.paymentId);
                    return [4 /*yield*/, fetch("https://api.stripe.com/v1/checkout/sessions", {
                            method: "POST",
                            headers: {
                                Authorization: "Bearer " + key,
                                "Content-Type": "application/x-www-form-urlencoded"
                            },
                            body: params.toString()
                        })];
                case 1:
                    res = _c.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _c.sent();
                    if (!res.ok) {
                        throw new Error("Stripe Checkout Session failed: " + ((_b = (_a = data.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : res.status));
                    }
                    // `payment_intent` is populated synchronously for `mode: "payment"` sessions.
                    return [2 /*return*/, { providerRef: data.payment_intent, url: data.url }];
            }
        });
    });
}
function createPaypalIntent(opts) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var env, base, id, secret, tokRes, tok, res, data, approveLink;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    env = (_a = Deno.env.get("PAYPAL_ENV")) !== null && _a !== void 0 ? _a : "sandbox";
                    base = env === "production"
                        ? "https://api-m.paypal.com"
                        : "https://api-m.sandbox.paypal.com";
                    id = Deno.env.get("PAYPAL_CLIENT_ID");
                    secret = Deno.env.get("PAYPAL_CLIENT_SECRET");
                    return [4 /*yield*/, fetch(base + "/v1/oauth2/token", {
                            method: "POST",
                            headers: {
                                Authorization: "Basic " + base64(id + ":" + secret),
                                "Content-Type": "application/x-www-form-urlencoded"
                            },
                            body: "grant_type=client_credentials"
                        })];
                case 1:
                    tokRes = _c.sent();
                    return [4 /*yield*/, tokRes.json()];
                case 2:
                    tok = _c.sent();
                    if (!tokRes.ok)
                        throw new Error("PayPal OAuth failed: " + JSON.stringify(tok));
                    return [4 /*yield*/, fetch(base + "/v2/checkout/orders", {
                            method: "POST",
                            headers: {
                                Authorization: "Bearer " + tok.access_token,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                intent: "CAPTURE",
                                purchase_units: [{
                                        reference_id: opts.bookingId,
                                        custom_id: opts.paymentId,
                                        amount: { currency_code: opts.currency.toUpperCase(), value: opts.amount.toFixed(2) }
                                    }],
                                application_context: {
                                    return_url: siteUrl() + "/booking?paypal=return&bookingId=" + opts.bookingId,
                                    cancel_url: siteUrl() + "/booking?paypal=cancel&bookingId=" + opts.bookingId
                                }
                            })
                        })];
                case 3:
                    res = _c.sent();
                    return [4 /*yield*/, res.json()];
                case 4:
                    data = _c.sent();
                    if (!res.ok)
                        throw new Error("PayPal order create failed: " + JSON.stringify(data));
                    approveLink = ((_b = data.links) !== null && _b !== void 0 ? _b : []).find(function (l) { return l.rel === "approve"; });
                    return [2 /*return*/, { providerRef: data.id, approveUrl: approveLink === null || approveLink === void 0 ? void 0 : approveLink.href }];
            }
        });
    });
}
// --- Handler -----------------------------------------------------------------
Deno.serve(function (req) { return __awaiter(void 0, void 0, void 0, function () {
    var body, _a, provider, amount, _b, currency, bookingId, _c, data, error, _d, paymentRow, payErr, paymentId, result, updErr, err_1, message;
    var _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                if (req.method === "OPTIONS")
                    return [2 /*return*/, new Response(null, { headers: CORS_HEADERS })];
                if (req.method !== "POST")
                    return [2 /*return*/, json({ error: "method not allowed" }, 405)];
                _f.label = 1;
            case 1:
                _f.trys.push([1, 3, , 4]);
                return [4 /*yield*/, req.json()];
            case 2:
                body = _f.sent();
                return [3 /*break*/, 4];
            case 3:
                _a = _f.sent();
                return [2 /*return*/, json({ error: "invalid JSON body" }, 400)];
            case 4:
                provider = body.provider, amount = body.amount, _b = body.currency, currency = _b === void 0 ? "KES" : _b;
                if (!provider || !["mpesa", "stripe", "paypal"].includes(provider)) {
                    return [2 /*return*/, json({ error: "provider must be mpesa, stripe, or paypal" }, 400)];
                }
                if (typeof amount !== "number" || amount <= 0) {
                    return [2 /*return*/, json({ error: "amount must be a positive number" }, 400)];
                }
                bookingId = body.bookingId;
                if (!!bookingId) return [3 /*break*/, 6];
                if (!body.booking)
                    return [2 /*return*/, json({ error: "bookingId or booking object required" }, 400)];
                return [4 /*yield*/, supabase
                        .from("bookings")
                        .insert(__assign(__assign({}, body.booking), { currency: (_e = body.booking.currency) !== null && _e !== void 0 ? _e : currency, status: "pending_payment" }))
                        .select("id")
                        .single()];
            case 5:
                _c = _f.sent(), data = _c.data, error = _c.error;
                if (error)
                    return [2 /*return*/, json({ error: "booking insert failed: " + error.message }, 500)];
                bookingId = data.id;
                _f.label = 6;
            case 6:
                // Supabase's untyped client returns `id` as `any`, so the assignment
                // above doesn't narrow `bookingId` back to `string` for the type
                // checker — and it's a real (if unlikely) runtime possibility if the
                // insert above ever returns a falsy id. Guard explicitly.
                if (!bookingId)
                    return [2 /*return*/, json({ error: "internal: booking id missing" }, 500)];
                return [4 /*yield*/, supabase
                        .from("payments")
                        .insert({
                        booking_id: bookingId,
                        provider: provider,
                        amount: amount,
                        currency: currency.toUpperCase(),
                        status: "initiated"
                    })
                        .select("id")
                        .single()];
            case 7:
                _d = _f.sent(), paymentRow = _d.data, payErr = _d.error;
                if (payErr)
                    return [2 /*return*/, json({ error: "payments insert failed: " + payErr.message }, 500)];
                paymentId = paymentRow.id;
                _f.label = 8;
            case 8:
                _f.trys.push([8, 16, , 18]);
                result = {
                    providerRef: ""
                };
                if (!(provider === "mpesa")) return [3 /*break*/, 10];
                if (!body.phone)
                    return [2 /*return*/, json({ error: "phone required for M-Pesa" }, 400)];
                return [4 /*yield*/, createMpesaIntent({ phone: body.phone, amount: amount, bookingId: bookingId, paymentId: paymentId })];
            case 9:
                result = _f.sent();
                return [3 /*break*/, 14];
            case 10:
                if (!(provider === "stripe")) return [3 /*break*/, 12];
                return [4 /*yield*/, createStripeIntent({ amount: amount, currency: currency, bookingId: bookingId, paymentId: paymentId })];
            case 11:
                result = _f.sent();
                return [3 /*break*/, 14];
            case 12: return [4 /*yield*/, createPaypalIntent({ amount: amount, currency: currency, bookingId: bookingId, paymentId: paymentId })];
            case 13:
                result = _f.sent();
                _f.label = 14;
            case 14: return [4 /*yield*/, supabase
                    .from("payments")
                    .update({ provider_ref: result.providerRef })
                    .eq("id", paymentId)];
            case 15:
                updErr = (_f.sent()).error;
                if (updErr)
                    console.error("payments update failed", updErr);
                return [2 /*return*/, json({
                        providerRef: result.providerRef,
                        url: result.url,
                        approveUrl: result.approveUrl,
                        paymentId: paymentId,
                        bookingId: bookingId
                    })];
            case 16:
                err_1 = _f.sent();
                message = err_1 instanceof Error ? err_1.message : String(err_1);
                // Mark the payment failed so we don't leave orphan initiated rows.
                return [4 /*yield*/, supabase
                        .from("payments")
                        .update({ status: "failed", raw_payload: { error: message } })
                        .eq("id", paymentId)];
            case 17:
                // Mark the payment failed so we don't leave orphan initiated rows.
                _f.sent();
                return [2 /*return*/, json({ error: message }, 502)];
            case 18: return [2 /*return*/];
        }
    });
}); });
