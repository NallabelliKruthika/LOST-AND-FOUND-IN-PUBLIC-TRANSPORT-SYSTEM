// Scoring-based matching: category (40) + location (25) + description keywords (25) + date proximity (10)
const { Report } = require('./models');
const STOP = new Set(['the', 'and', 'with', 'was', 'has', 'have', 'for', 'near', 'from', 'that', 'this', 'its', 'are', 'item', 'lost', 'found']);
const tokens = s => new Set(((s || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => {
  if (!a.size || !b.size) return 0;
  let n = 0; a.forEach(w => b.has(w) && n++);
  return n / Math.min(a.size, b.size);
};
const THRESHOLD = 50;

function score(a, b) {
  let s = 0;
  if (a.category === b.category) s += 40;
  s += 25 * overlap(tokens(a.location), tokens(b.location));
  s += 25 * overlap(tokens(a.description), tokens(b.description));
  const days = Math.abs(new Date(a.date) - new Date(b.date)) / 864e5;
  if (days <= 3) s += 10; else if (days <= 7) s += 5;
  return Math.round(s);
}

async function findMatches(report) {
  const others = await Report.find({
    type: report.type === 'Lost' ? 'Found' : 'Lost',
    status: { $in: ['Pending', 'Matched'] },
    user: { $ne: report.user }
  }).populate('user', 'name phone email');
  return others
    .map(o => ({ report: o, score: score(report, o) }))
    .filter(x => x.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

module.exports = { findMatches, score };
