require('dotenv').config();

const apiKey = process.env.GOOGLE_API_KEY;
const cx = process.env.GOOGLE_CX;

if (!apiKey || !cx) {
  console.warn(
    '⚠️ GOOGLE_API_KEY / GOOGLE_CX non configurés — recherche web en fallback lien manuel'
  );
}

module.exports = {
  apiKey,
  cx,
  enabled: Boolean(apiKey && cx),
};
