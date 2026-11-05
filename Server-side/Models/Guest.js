const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: "Sri Lanka" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    at: { type: Date, default: Date.now },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const guestSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [require("validator").isEmail, "Provide a valid email address"],
    },
    guestToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    addresses: { type: [addressSchema], default: [] },
    activityLog: { type: [activitySchema], default: [] },
    preferences: {
      promoOptIn: { type: Boolean, default: true },
    },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    verified: { type: Boolean, default: false },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    orderCount: {
      type: Number,
      default: 0,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// guestSchema.index({ email: 1 }); // Already declared via email.unique

// Cap activity log to last 200 entries to prevent unbounded growth.
guestSchema.pre("save", function () {
  if (Array.isArray(this.activityLog) && this.activityLog.length > 200) {
    this.activityLog = this.activityLog.slice(-200);
  }
});

module.exports = mongoose.model("Guest", guestSchema);
