const m = require('mongoose');
const S = m.Schema;
const ref = n => ({ type: S.Types.ObjectId, ref: n });

const User = m.model('User', new S({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}));

const Report = m.model('Report', new S({
  type: { type: String, enum: ['Lost', 'Found'], required: true },
  category: String,
  description: String,
  location: String,
  date: Date,
  imagePath: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Matched', 'Claimed', 'Unclaimed', 'Returned'], default: 'Pending' },
  user: ref('User')
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));

const Claim = m.model('Claim', new S({
  reportLost: ref('Report'),
  reportFound: ref('Report'),
  user: ref('User'),
  claimStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));

const Notification = m.model('Notification', new S({
  user: ref('User'),
  message: String,
  readStatus: { type: Boolean, default: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } }));

module.exports = { User, Report, Claim, Notification };
