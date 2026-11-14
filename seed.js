require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('./models');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lostfound');
  const mk = async (name, email, pw, role) => {
    if (await User.findOne({ email })) return console.log('exists:', email);
    await User.create({ name, email, password: await bcrypt.hash(pw, 10), role, phone: '9999999999' });
    console.log('created:', email, '/', pw);
  };
  await mk('Admin', 'admin@transit.com', 'admin123', 'admin');
  await mk('Demo Passenger', 'user@transit.com', 'user123', 'user');
  process.exit(0);
})();
