// Deprecated stub. server.js now creates the Supabase admin client directly.
module.exports = function () {
  console.warn(
    "Deprecated supabaseClient required — use server.js supabaseAdmin instead"
  );
  return null;
};
