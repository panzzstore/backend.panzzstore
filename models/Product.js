const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  game: { type: String, required: true },
  title: { type: String, required: true },
  badge: { type: String, required: true },
  icon: { type: String, required: true },
  features: { type: [String], required: true },
  price: { type: String, required: true },
  priceNum: { type: Number, required: true },
  spec: { type: [String], required: true },
  minus: { type: [String], required: true },
  photos: { type: [String], required: true },
  accountData: {
    email: { type: String, required: true },
    passwordEmail: { type: String, required: true },
    passwordAccount: { type: String, required: true },
    server: { type: String, required: true },
    securityQuestion: { type: String, required: true },
    securityAnswer: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
