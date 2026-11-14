require('dotenv').config();
const express = require('express'), mongoose = require('mongoose'), multer = require('multer');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), path = require('path'), fs = require('fs');
const { User, Report, Claim, Notification } = require('./models');
const { findMatches } = require('./matcher');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
fs.mkdirSync('uploads', { recursive: true });
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads',
    filename: (r, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(f.originalname))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /^image\//.test(f.mimetype))
});

const wrap = fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message }));
const auth = roles => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
  } catch { return res.status(401).json({ error: 'Please log in' }); }
  if (roles && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
  next();
};
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const notify = (user, message) => Notification.create({ user, message });
const sign = u => jwt.sign({ id: u._id, role: u.role, name: u.name }, SECRET, { expiresIn: '7d' });

// ---------- Auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ error: 'Email already registered' });
  const u = await User.create({ name, email, phone, password: await bcrypt.hash(password, 10), role: 'user' });
  res.json({ token: sign(u), user: { name: u.name, role: u.role } });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password))) return res.status(400).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { name: u.name, role: u.role } });
}));

// ---------- Reports ----------
const create = type => wrap(async (req, res) => {
  const { category, description, location, date } = req.body;
  if (!category || !description || !location || !date) return res.status(400).json({ error: 'All fields are required' });
  const r = await Report.create({ type, category, description, location, date, user: req.user.id, imagePath: req.file ? '/uploads/' + req.file.filename : '' });
  const matches = await findMatches(r);
  for (const m of matches.slice(0, 3)) {
    await notify(m.report.user._id, `A possible match found for your ${m.report.type.toLowerCase()} item: ${m.report.category}, ${m.report.location}.`);
  }
  if (matches.length) await notify(r.user, `A possible match found for your ${type.toLowerCase()} item: ${r.category}, ${r.location}.`);
  res.json({ report: r, matches: matches.length });
});
app.post('/api/reports/lost', auth(), upload.single('image'), create('Lost'));
app.post('/api/reports/found', auth(), upload.single('image'), create('Found'));

app.get('/api/reports', auth(['admin']), wrap(async (req, res) => {
  res.json(await Report.find().sort('-createdAt').populate('user', 'name email phone'));
}));

app.get('/api/reports/mine', auth(), wrap(async (req, res) => {
  res.json(await Report.find({ user: req.user.id }).sort('-createdAt'));
}));

app.get('/api/reports/search', auth(), wrap(async (req, res) => {
  const { query, type, category, location, from, to } = req.query;
  const q = {};
  if (type) q.type = type;
  if (category) q.category = category;
  if (location) q.location = new RegExp(esc(location), 'i');
  if (from || to) { q.date = {}; if (from) q.date.$gte = new Date(from); if (to) q.date.$lte = new Date(to + 'T23:59:59'); }
  if (query) { const re = new RegExp(esc(query), 'i'); q.$or = [{ description: re }, { category: re }, { location: re }]; }
  res.json(await Report.find(q).sort('-createdAt').limit(100).populate('user', 'name'));
}));

app.get('/api/reports/matches/:id', auth(), wrap(async (req, res) => {
  const r = await Report.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  if (req.user.role !== 'admin' && String(r.user) !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  res.json(await findMatches(r));
}));

app.put('/api/reports/:id/status', auth(['admin']), wrap(async (req, res) => {
  if (!['Pending', 'Claimed', 'Unclaimed', 'Returned'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  const r = await Report.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (r) await notify(r.user, `Status of your ${r.type.toLowerCase()} report (${r.category}) is now ${r.status}.`);
  res.json(r);
}));

app.put('/api/reports/:id', auth(), wrap(async (req, res) => {
  const r = await Report.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  if (String(r.user) !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  ['category', 'description', 'location', 'date'].forEach(k => req.body[k] && (r[k] = req.body[k]));
  await r.save();
  res.json(r);
}));

app.delete('/api/reports/:id', auth(), wrap(async (req, res) => {
  const r = await Report.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  if (req.user.role !== 'admin' && String(r.user) !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
  await r.deleteOne();
  res.json({ ok: true });
}));

// ---------- Claims ----------
app.post('/api/claims', auth(), wrap(async (req, res) => {
  const a = await Report.findById(req.body.myReportId), b = await Report.findById(req.body.otherReportId);
  if (!a || !b || a.type === b.type) return res.status(400).json({ error: 'Need one Lost and one Found report' });
  if (String(a.user) !== req.user.id) return res.status(403).json({ error: 'You can only claim with your own report' });
  const lost = a.type === 'Lost' ? a : b, found = a.type === 'Found' ? a : b;
  if (await Claim.findOne({ reportLost: lost._id, reportFound: found._id, claimStatus: 'Pending' })) return res.status(400).json({ error: 'Claim already submitted' });
  const c = await Claim.create({ reportLost: lost._id, reportFound: found._id, user: req.user.id });
  await Report.updateMany({ _id: { $in: [lost._id, found._id] } }, { status: 'Matched' });
  res.json(c);
}));

app.get('/api/claims', auth(), wrap(async (req, res) => {
  const q = req.user.role === 'admin' ? {} : { user: req.user.id };
  res.json(await Claim.find(q).sort('-createdAt').populate('reportLost').populate('reportFound').populate('user', 'name email phone'));
}));

const decide = approve => wrap(async (req, res) => {
  const c = await Claim.findById(req.params.id).populate('reportLost').populate('reportFound');
  if (!c) return res.status(404).json({ error: 'Claim not found' });
  c.claimStatus = approve ? 'Approved' : 'Rejected';
  await c.save();
  const ids = [c.reportLost._id, c.reportFound._id];
  await Report.updateMany({ _id: { $in: ids } }, { status: approve ? 'Claimed' : 'Pending' });
  const msg = approve
    ? `Claim approved: ${c.reportLost.category} (${c.reportFound.location}) is marked Claimed. Contact the admin to collect it.`
    : `Claim rejected for ${c.reportLost.category}. Your reports are open for matching again.`;
  await notify(c.reportLost.user, msg);
  if (String(c.reportFound.user) !== String(c.reportLost.user)) await notify(c.reportFound.user, msg);
  res.json(c);
});
app.put('/api/claims/:id/approve', auth(['admin']), decide(true));
app.put('/api/claims/:id/reject', auth(['admin']), decide(false));

// ---------- Notifications & stats ----------
app.get('/api/notifications', auth(), wrap(async (req, res) => {
  res.json(await Notification.find({ user: req.user.id }).sort('-createdAt').limit(30));
}));
app.put('/api/notifications/read', auth(), wrap(async (req, res) => {
  await Notification.updateMany({ user: req.user.id }, { readStatus: true });
  res.json({ ok: true });
}));
app.get('/api/admin/stats', auth(['admin']), wrap(async (req, res) => {
  const group = f => Report.aggregate([{ $group: { _id: '$' + f, count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
  res.json({ categories: await group('category'), statuses: await group('status'), types: await group('type') });
}));

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lostfound')
  .then(() => app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`)))
  .catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
